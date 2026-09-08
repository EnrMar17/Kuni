"""
=================================================================================
SISTEMA DE ALERTAS PREDICTIVAS — Diabetes e Hipertensión
=================================================================================

Este script hace DOS COSAS distintas y las deja claramente separadas:

  MODELO A — "Clasificador de riesgo actual"
      Aplica las reglas clínicas (GPC Diabetes/HAS) sobre el estado presente
      del paciente y calcula un nivel de riesgo: bajo / moderado / alto.
      Es la base de las ALERTAS ROJAS (situación urgente AHORA).

  MODELO B — "Predictor de empeoramiento futuro"
      Aprende de datos históricos reales (múltiples ventanas de tiempo por
      paciente) para anticipar si el paciente EMPEORARÁ en el siguiente
      periodo, incluso si hoy se ve estable.
      Es la base de las ALERTAS NARANJAS (seguimiento preventivo).

USO:
    python pipeline_completo.py --input ruta/a/tu_dataset.csv

SALIDAS (carpeta ./salidas/):
    - dataset_con_riesgo.parquet      -> cada fila con su nivel de riesgo actual
    - modelo_riesgo_actual.joblib     -> Modelo A entrenado
    - modelo_prediccion_futura.joblib -> Modelo B entrenado
    - reporte_metricas.txt            -> métricas de ambos modelos
=================================================================================
"""

import argparse
import hashlib
import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import joblib
from modelo_wrapper import ModeloCalibrado, ModeloCalibradoEstratificado

# Columnas del dataset original que necesitamos (ajusta esto si tu CSV tiene
# nombres distintos)
COLUMNAS_NECESARIAS = [
    'cx_curp', 'window', 'count_cx_w', 'age_at_wx',
    'diabetes_mellitus_type_2', 'essential_(primary)_hypertension',
    'fn_ta_systolic_mean', 'fn_ta_systolic_slope',
    'fn_ta_diastolic_mean', 'fn_ta_diastolic_slope',
    'in_glucose_mean', 'in_glucose_slope',
    'antidiabetics_sum', 'antidiabetics_count',
    'antihypertensives_sum', 'antihypertensives_count',
    'e110', 'e111', 'e112', 'e113', 'e114', 'e115', 'e116', 'e117', 'e118',
]

FEATURE_COLS = [
    'age_at_wx', 'diabetes_dx', 'hypertension_dx', 'comorbido_dm_has',
    'fn_ta_systolic_mean', 'fn_ta_diastolic_mean',
    'tendencia_sistolica', 'tendencia_diastolica', 'pa_empeorando',
    'in_glucose_mean', 'tendencia_glucosa', 'glucosa_empeorando',
    'adherencia_antidiabeticos', 'adherencia_antihipertensivos',
    'num_complicaciones_dm', 'tiene_complicacion_dm', 'complicacion_grave_dm',
]


# =================================================================================
# PASO 1-2: CARGA Y PRIVACIDAD
# =================================================================================
def cargar_y_anonimizar(ruta_csv: str) -> pd.DataFrame:
    """Carga el CSV y reemplaza el identificador real (CURP) por un hash
    irreversible. Nunca se guarda ni se usa la CURP original más allá de esta
    función."""
    df = pd.read_csv(ruta_csv, usecols=COLUMNAS_NECESARIAS, low_memory=True)

    df['patient_id'] = df['cx_curp'].apply(
        lambda x: hashlib.sha256(str(x).encode()).hexdigest()[:16]
    )
    df = df.drop(columns=['cx_curp'])
    df = df.rename(columns={
        'essential_(primary)_hypertension': 'hypertension_dx',
        'diabetes_mellitus_type_2': 'diabetes_dx',
    })
    return df


# =================================================================================
# PASO 3: MANEJO DE DATOS FALTANTES
# =================================================================================
def manejar_faltantes(df: pd.DataFrame) -> pd.DataFrame:
    """Para variables de laboratorio con muchos huecos (glucosa, etc.), usa el
    último valor conocido DEL MISMO PACIENTE (forward-fill) en vez de rellenar
    con el promedio de toda la población, que sesgaría el dato."""
    df = df.sort_values(['patient_id', 'window'])

    lab_cols = ['in_glucose_mean']
    bp_cols = ['fn_ta_systolic_mean', 'fn_ta_diastolic_mean']

    df[lab_cols + bp_cols] = df.groupby('patient_id')[lab_cols + bp_cols].ffill()
    return df


# =================================================================================
# PASO 4: FEATURE ENGINEERING
# =================================================================================
def construir_features(df: pd.DataFrame) -> pd.DataFrame:
    """Construye las variables clínicas derivadas: adherencia, comorbilidad,
    complicaciones y tendencias (ya winsorizadas para evitar outliers
    imposibles causados por pendientes calculadas con pocos puntos)."""
    df['count_cx_w'] = df['count_cx_w'].fillna(df['count_cx_w'].median()).replace(0, np.nan)

    df['adherencia_antidiabeticos'] = (
        df['antidiabetics_count'] / df['count_cx_w']
    ).clip(0, 1).fillna(0)
    df['adherencia_antihipertensivos'] = (
        df['antihypertensives_count'] / df['count_cx_w']
    ).clip(0, 1).fillna(0)

    df['comorbido_dm_has'] = ((df['diabetes_dx'] == 1) & (df['hypertension_dx'] == 1)).astype(int)

    complicacion_cols = ['e110', 'e111', 'e112', 'e113', 'e114', 'e115', 'e116', 'e117', 'e118']
    df['num_complicaciones_dm'] = df[complicacion_cols].sum(axis=1)
    df['tiene_complicacion_dm'] = (df['num_complicaciones_dm'] > 0).astype(int)
    df['complicacion_grave_dm'] = df[['e110', 'e111', 'e112']].max(axis=1).fillna(0).astype(int)

    # Winsorizing: recorta pendientes extremas al percentil 1-99
    for col_slope, col_out in [
        ('fn_ta_systolic_slope', 'tendencia_sistolica'),
        ('fn_ta_diastolic_slope', 'tendencia_diastolica'),
        ('in_glucose_slope', 'tendencia_glucosa'),
    ]:
        p1, p99 = df[col_slope].quantile([0.01, 0.99])
        df[col_out] = df[col_slope].clip(p1, p99)

    df['pa_empeorando'] = (df['tendencia_sistolica'] > 1.0).astype(int)
    df['glucosa_empeorando'] = (df['tendencia_glucosa'] > 2.0).astype(int)

    return df


# =================================================================================
# PASO 5: ETIQUETADO — MODELO A (reglas clínicas GPC)
# =================================================================================
# Umbrales de glucosa en ayuno SEGÚN FASE DE TRATAMIENTO (GPC DM2).
# Un paciente en titulación de insulina tiene una meta distinta (80-130 mg/dL)
# a uno estable con antidiabéticos orales (meta general <126 mg/dL).
UMBRALES_GLUCOSA_POR_FASE = {
    'estable_oral':            [(300, 40), (181, 25), (126, 15), (100, 10)],
    'ajuste_insulina':         [(250, 40), (180, 25), (130, 15), (80, 0)],   # meta 80-130
    'insulina_estable_hba1c':  [(250, 40), (180, 25), (140, 15), (90, 5)],
}

# Umbral de "brecha de monitoreo" (días sin reportar) según fase de tratamiento.
# Superarlo suma puntos de riesgo por sí solo, incluso sin un valor anómalo.
DIAS_BRECHA_MONITOREO = {
    'estable_oral': 90,           # ~3 meses (GPC DM2 controlado)
    'ajuste_insulina': 1,         # diario: 1 día sin reportar ya es alerta
    'insulina_estable_hba1c': 3,
}
DIAS_BRECHA_MONITOREO_HAS = {
    'controlada': 365,            # 1 año (pendiente de confirmar vs. la fuente de 3 meses)
    'en_ajuste': 7,                # semanal
}


def calcular_riesgo_actual(df: pd.DataFrame) -> pd.DataFrame:
    """Traduce las guías de práctica clínica (GPC Diabetes/HAS) en un score
    0-100 y un nivel de riesgo categórico. Esta es la MISMA lógica que se
    usará como "alertas rojas" en producción, aquí sirve para etiquetar el
    dataset.

    NOTA IMPORTANTE (limitación documentada): el dataset histórico usado
    para entrenar NO contiene el campo "estado_tratamiento_dm/has" (fase de
    insulina, ajuste, etc.), porque esa distinción no viene en los datos
    crudos. Para el entrenamiento, se asume 'estable_oral' / 'controlada'
    como valor neutro por defecto. En PRODUCCIÓN, este valor debe venir del
    expediente del paciente (lo captura el médico), no de un supuesto.
    """
    if 'estado_tratamiento_dm' not in df.columns:
        df['estado_tratamiento_dm'] = 'estable_oral'
    if 'estado_tratamiento_has' not in df.columns:
        df['estado_tratamiento_has'] = 'controlada'
    if 'dias_desde_ultimo_reporte' not in df.columns:
        df['dias_desde_ultimo_reporte'] = 0  # sin dato histórico de esto -> neutro

    score = pd.Series(0.0, index=df.index)
    pas, pad = df['fn_ta_systolic_mean'], df['fn_ta_diastolic_mean']
    glu = df['in_glucose_mean']
    comorbido = df['comorbido_dm_has'] == 1

    meta_pas = np.where(comorbido, 130, 140)
    meta_pad = np.where(comorbido, 80, 90)

    score += np.select([pas >= 180, pas >= 160, pas >= meta_pas, pas >= (meta_pas - 10)],
                        [40, 25, 15, 10], default=0)
    score += np.select([pad >= 110, pad >= 100, pad >= meta_pad], [40, 25, 10], default=0)

    # --- Glucosa POSTPRANDIAL (opcional -- solo si el bot la capturó por separado) ---
    # Meta GPC: <180 mg/dL. Retrocompatible: si la columna no existe (dataset
    # histórico de entrenamiento no la distingue), no suma nada.
    if 'in_glucose_postprandial_mean' in df.columns:
        glu_pp = df['in_glucose_postprandial_mean']
        score += np.select([glu_pp >= 250, glu_pp >= 180], [25, 15], default=0)


    # --- Glucosa: umbral dinámico según fase de tratamiento ---
    puntos_glucosa = pd.Series(0.0, index=df.index)
    for fase, umbrales in UMBRALES_GLUCOSA_POR_FASE.items():
        mascara_fase = df['estado_tratamiento_dm'] == fase
        conditions = [glu >= t for t, _ in umbrales]
        values = [p for _, p in umbrales]
        puntos_glucosa = puntos_glucosa.where(~mascara_fase, np.select(conditions, values, default=0))
    score += puntos_glucosa

    score += df['complicacion_grave_dm'] * 40
    score += (df['tiene_complicacion_dm'] & ~df['complicacion_grave_dm'].astype(bool)) * 15
    score += (df['adherencia_antidiabeticos'] < 0.5).astype(int) * 15 * (df['diabetes_dx'] == 1)
    score += (df['adherencia_antihipertensivos'] < 0.5).astype(int) * 15 * (df['hypertension_dx'] == 1)
    score += df['pa_empeorando'] * 10 + df['glucosa_empeorando'] * 10
    score += comorbido.astype(int) * 10

    # --- Brecha de monitoreo: dispara puntos si el paciente dejó de reportar
    # más días de lo que su fase de tratamiento permite ---
    umbral_brecha_dm = df['estado_tratamiento_dm'].map(DIAS_BRECHA_MONITOREO).fillna(90)
    umbral_brecha_has = df['estado_tratamiento_has'].map(DIAS_BRECHA_MONITOREO_HAS).fillna(365)
    umbral_brecha = np.minimum(
        np.where(df['diabetes_dx'] == 1, umbral_brecha_dm, np.inf),
        np.where(df['hypertension_dx'] == 1, umbral_brecha_has, np.inf),
    )
    brecha_excedida = df['dias_desde_ultimo_reporte'] > umbral_brecha
    # Si es fase de insulina en ajuste, la brecha es urgente (40 pts); si no, es más leve (20 pts)
    es_insulina_ajuste = df['estado_tratamiento_dm'] == 'ajuste_insulina'
    score += np.where(brecha_excedida & es_insulina_ajuste, 40,
                       np.where(brecha_excedida, 20, 0))
    df['brecha_monitoreo_excedida'] = brecha_excedida.astype(int)

    df['risk_score'] = score.clip(0, 100)
    df['nivel_riesgo'] = pd.cut(df['risk_score'], bins=[-1, 30, 60, 100],
                                 labels=['bajo', 'moderado', 'alto'])
    df['nivel_riesgo_ord'] = df['nivel_riesgo'].map({'bajo': 0, 'moderado': 1, 'alto': 2})
    return df


# =================================================================================
# PASO 6-7: ENTRENAR MODELO A (clasificador de riesgo actual)
# =================================================================================
def entrenar_modelo_riesgo_actual(df: pd.DataFrame, out_dir: str):
    pacientes = np.array(df['patient_id'].unique(), dtype=object)
    train_ids, test_ids = train_test_split(pacientes, test_size=0.2, random_state=42)
    train_df, test_df = df[df['patient_id'].isin(train_ids)], df[df['patient_id'].isin(test_ids)]

    X_train, y_train = train_df[FEATURE_COLS].fillna(-1), train_df['nivel_riesgo']
    X_test, y_test = test_df[FEATURE_COLS].fillna(-1), test_df['nivel_riesgo']

    modelo = RandomForestClassifier(n_estimators=200, max_depth=10,
                                     class_weight='balanced', random_state=42, n_jobs=-1)
    modelo.fit(X_train, y_train)
    y_pred = modelo.predict(X_test)

    reporte = classification_report(y_test, y_pred)
    joblib.dump(modelo, os.path.join(out_dir, "modelo_riesgo_actual.joblib"))
    return reporte, train_ids, test_ids


# =================================================================================
# PASO 8: ETIQUETADO Y ENTRENAMIENTO — MODELO B v4 (target multi-criterio,
# SIN el criterio de delta de risk_score -- versión ganadora tras comparar
# 3 alternativas contra el efecto techo. Ver: comparar_alternativas.py)
# =================================================================================
def categoria_glucosa(valor):
    """Categoría clínica ordinal de glucosa en ayuno, según umbrales GPC DM2."""
    if pd.isna(valor):
        return np.nan
    if valor < 100:
        return 0
    elif valor < 126:
        return 1
    elif valor < 181:
        return 2
    elif valor < 300:
        return 3
    else:
        return 4


def categoria_pa(pas, pad):
    """Categoría clínica ordinal de presión arterial, según tabla GPC HAS (ESH-ESC)."""
    if pd.isna(pas) or pd.isna(pad):
        return np.nan
    if pas >= 180 or pad >= 110:
        return 5
    elif pas >= 160 or pad >= 100:
        return 4
    elif pas >= 140 or pad >= 90:
        return 3
    elif pas >= 130 or pad >= 85:
        return 2
    elif pas >= 120 or pad >= 80:
        return 1
    else:
        return 0


def entrenar_modelo_prediccion_futura(df: pd.DataFrame, train_ids, test_ids, out_dir: str):
    """Predice 'descompensacion_futura': si en la ventana N+1 aparece una
    complicación grave nueva, O empeora la categoría clínica de glucosa, O
    empeora la categoría clínica de PA.

    NOTA HISTÓRICA IMPORTANTE: se probó una versión anterior que incluía un
    cuarto criterio (delta de risk_score >= 15), y también una variante con
    margen relativo. Ambas se descartaron: causaban un "efecto techo" donde
    un paciente ya cerca de risk_score=100 recibía una probabilidad MENOR a
    la que le correspondía, porque risk_score está limitado a 100 y no le
    quedaba margen matemático para "subir 15+ puntos más". Se validó con un
    paciente sintético en dos momentos (día 75 estable vs. día 150
    deteriorado): solo esta versión (sin el criterio de score) predijo
    correctamente que el riesgo debía subir, además de tener mejor AUC-ROC
    (0.814) y mejor Brier score (0.096) que las alternativas descartadas."""
    df = df.sort_values(['patient_id', 'window']).reset_index(drop=True)
    df['cat_glucosa'] = df['in_glucose_mean'].apply(categoria_glucosa)
    df['cat_pa'] = df.apply(lambda r: categoria_pa(r['fn_ta_systolic_mean'], r['fn_ta_diastolic_mean']), axis=1)

    grp = df.groupby('patient_id')
    df['siguiente_window'] = grp['window'].shift(-1)
    df['siguiente_complicacion_grave'] = grp['complicacion_grave_dm'].shift(-1)
    df['siguiente_cat_glucosa'] = grp['cat_glucosa'].shift(-1)
    df['siguiente_cat_pa'] = grp['cat_pa'].shift(-1)

    df_pred = df[df['siguiente_window'] == df['window'] + 1].copy()

    nueva_complicacion_grave = ((df_pred['siguiente_complicacion_grave'] == 1) & (df_pred['complicacion_grave_dm'] == 0))
    glucosa_empeora = (df_pred['siguiente_cat_glucosa'] > df_pred['cat_glucosa']).fillna(False)
    pa_empeora = (df_pred['siguiente_cat_pa'] > df_pred['cat_pa']).fillna(False)

    df_pred['descompensacion_futura'] = (nueva_complicacion_grave | glucosa_empeora | pa_empeora).astype(int)

    # Bandera de "en techo" -- necesaria para calibrar cada grupo por
    # separado (ver ModeloCalibradoEstratificado en modelo_wrapper.py)
    df_pred['en_techo'] = (
        ((df_pred['diabetes_dx'] == 1) & (df_pred['cat_glucosa'] == 4)) |
        ((df_pred['hypertension_dx'] == 1) & (df_pred['cat_pa'] == 5)) |
        (df_pred['complicacion_grave_dm'] == 1)
    )

    # CORRECCIÓN IMPORTANTE: el split de train/test debe hacerse sobre la
    # población de pacientes que SÍ tienen una ventana N/N+1 válida (no
    # sobre todos los pacientes del dataset, que es lo que hacía
    # entrenar_modelo_riesgo_actual). Si se usa la población equivocada,
    # el split con la misma semilla produce particiones completamente
    # distintas (validado: de 19,715 pacientes esperados en test, solo
    # 3,899 coincidían) y el modelo deja de reproducir los resultados ya
    # validados con el paciente sintético.
    pacientes_validos = np.array(df_pred['patient_id'].unique(), dtype=object)
    train_ids_propio, test_ids_propio = train_test_split(pacientes_validos, test_size=0.2, random_state=42)
    train_ids_sub, calib_ids_sub = train_test_split(train_ids_propio, test_size=0.25, random_state=42)

    cols = FEATURE_COLS + ['risk_score']
    train_df = df_pred[df_pred['patient_id'].isin(train_ids_sub)]
    calib_df = df_pred[df_pred['patient_id'].isin(calib_ids_sub)]
    test_df = df_pred[df_pred['patient_id'].isin(test_ids_propio)]

    X_train, y_train = train_df[cols].fillna(-1), train_df['descompensacion_futura']
    X_calib, y_calib = calib_df[cols].fillna(-1), calib_df['descompensacion_futura']
    X_test, y_test = test_df[cols].fillna(-1), test_df['descompensacion_futura']

    sample_weight = np.where(y_train == 1, (y_train == 0).sum() / (y_train == 1).sum(), 1.0)
    base_modelo = GradientBoostingClassifier(n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42)
    base_modelo.fit(X_train, y_train, sample_weight=sample_weight)

    # --- Calibración ESTRATIFICADA: una curva para 'en techo', otra para 'sin techo' ---
    proba_cruda_calib = base_modelo.predict_proba(X_calib)[:, 1]
    calib_df = calib_df.copy()
    calib_df['proba_cruda'] = proba_cruda_calib

    mask_sin_techo = ~calib_df['en_techo'].values
    mask_en_techo = calib_df['en_techo'].values

    calibrador_sin_techo = IsotonicRegression(out_of_bounds='clip')
    calibrador_sin_techo.fit(proba_cruda_calib[mask_sin_techo], y_calib.values[mask_sin_techo])

    calibrador_en_techo = IsotonicRegression(out_of_bounds='clip')
    calibrador_en_techo.fit(proba_cruda_calib[mask_en_techo], y_calib.values[mask_en_techo])

    modelo_final = ModeloCalibradoEstratificado(base_modelo, calibrador_sin_techo, calibrador_en_techo)

    y_proba = modelo_final.predict_proba(X_test, en_techo=test_df['en_techo'].values)[:, 1]
    y_pred = (y_proba >= 0.15).astype(int)  # umbral calibrado para recall ~75%

    reporte = classification_report(y_test, y_pred, target_names=['no_descompensa', 'descompensa'])
    auc = roc_auc_score(y_test, y_proba)
    joblib.dump(modelo_final, os.path.join(out_dir, "modelo_prediccion_futura.joblib"))
    return reporte, auc, df_pred


def detectar_techo_categoria(paciente_row: dict) -> dict:
    """Detecta si CUALQUIERA de los criterios clínicos del paciente ya está
    en su categoría MÁS ALTA posible (glucosa, PA, o ya tiene una
    complicación grave). Si CUALQUIERA de ellos está en su techo, ese
    criterio específico ya no puede aportar señal de "empeoramiento
    adicional" al Modelo B -- no existe una categoría más alta a la que
    subir. Esto NO es un defecto del modelo, es un límite lógico de la
    definición del target.

    IMPORTANTE: la condición es "O" (basta con que UN criterio esté en su
    techo), no "Y" (no se exige que TODOS lo estén). Antes se exigía que
    incluso 'complicación grave' estuviera en True para activar el atajo,
    lo cual bloqueaba el caso más común: un paciente sin complicaciones
    registradas pero con PA en crisis -- ese paciente SÍ debe clasificarse
    como riesgo alto directamente, sin depender de que también tenga una
    complicación grave."""
    glu = paciente_row.get('in_glucose_mean')
    pas = paciente_row.get('fn_ta_systolic_mean')
    pad = paciente_row.get('fn_ta_diastolic_mean')

    techo_glucosa = (
        paciente_row.get('diabetes_dx') == 1
        and glu is not None
        and categoria_glucosa(glu) == 4  # categoría máxima: crisis hiperglucémica
    )
    techo_pa = (
        paciente_row.get('hypertension_dx') == 1
        and pas is not None and pad is not None
        and categoria_pa(pas, pad) == 5  # categoría máxima: Grado 3 / crisis
    )
    techo_complicacion = paciente_row.get('complicacion_grave_dm') == 1

    en_techo_maximo = bool(techo_glucosa or techo_pa or techo_complicacion)

    return {
        'techo_glucosa': bool(techo_glucosa),
        'techo_pa': bool(techo_pa),
        'techo_complicacion_grave': bool(techo_complicacion),
        'en_techo_maximo': en_techo_maximo,
    }


FEATURE_COLS_MODELO_B = FEATURE_COLS + ['risk_score']


VARIABLES_TRAYECTORIA = {
    'glucosa': 'in_glucose_mean',
    'pa_sistolica': 'fn_ta_systolic_mean',
    'pa_diastolica': 'fn_ta_diastolic_mean',
}


def entrenar_modelos_trayectoria(df: pd.DataFrame, train_ids, out_dir: str):
    """Entrena 3 modelos de regresión cuantil (bajo/esperado/alto) POR
    CADA variable (glucosa, PA sistólica, PA diastólica) -- 9 modelos en
    total. Se usan de forma ENCADENADA en producción (predecir_trayectoria)
    para proyectar varios pasos hacia adelante: la predicción de un paso
    se convierte en el 'dato actual' del siguiente paso."""
    df = df.sort_values(['patient_id', 'window']).reset_index(drop=True)
    grp = df.groupby('patient_id')
    df['siguiente_window'] = grp['window'].shift(-1)

    modelos = {}
    for nombre_var, columna in VARIABLES_TRAYECTORIA.items():
        df[f'siguiente_{columna}'] = grp[columna].shift(-1)
        df_var = df[(df['siguiente_window'] == df['window'] + 1) &
                     df[f'siguiente_{columna}'].notna() & df[columna].notna()].copy()

        train_df = df_var[df_var['patient_id'].isin(train_ids)]
        X_train = train_df[FEATURE_COLS + ['risk_score']].fillna(-1)
        y_train = train_df[f'siguiente_{columna}']

        modelos[nombre_var] = {}
        for cuantil, alpha in [("bajo", 0.10), ("esperado", 0.50), ("alto", 0.90)]:
            m = GradientBoostingRegressor(loss='quantile', alpha=alpha, n_estimators=80,
                                           max_depth=3, learning_rate=0.08, random_state=42)
            m.fit(X_train, y_train)
            modelos[nombre_var][cuantil] = m

    joblib.dump(modelos, os.path.join(out_dir, "modelos_trayectoria.joblib"))
    return modelos


def predecir_trayectoria(paciente_row: dict, modelos_trayectoria: dict, n_pasos: int = 3) -> dict:
    """Devuelve la proyección a n_pasos futuros para glucosa y PA, lista
    para graficar. Cada variable se encadena de forma INDEPENDIENTE."""
    fila_base = pd.DataFrame([paciente_row])
    fila_base = calcular_riesgo_actual(fila_base)  # calcula risk_score internamente
    risk_score_inicial = fila_base['risk_score'].iloc[0]

    resultado = {}
    for nombre_var, columna in VARIABLES_TRAYECTORIA.items():
        modelos = modelos_trayectoria[nombre_var]
        fila_actual = {**paciente_row, 'risk_score': risk_score_inicial}
        trayectoria = []
        for paso in range(1, n_pasos + 1):
            X = pd.DataFrame([fila_actual])[FEATURE_COLS + ['risk_score']].fillna(-1)
            esperado = modelos['esperado'].predict(X)[0]
            bajo = modelos['bajo'].predict(X)[0]
            alto = modelos['alto'].predict(X)[0]
            trayectoria.append({
                "paso": paso,
                "valor_esperado": round(float(esperado), 1),
                "rango_min": round(float(min(bajo, esperado)), 1),
                "rango_max": round(float(max(alto, esperado)), 1),
            })
            fila_actual[columna] = esperado
        resultado[nombre_var] = trayectoria
    return resultado


def predecir_riesgo_ml(paciente_row: dict, modelo_prediccion_futura,
                        model_version: str = "prediccion_futura_v4_2026-09-08",
                        datos_suficientes: dict = None) -> dict:
    """Contrato FINAL acordado con el equipo de Kuni: el endpoint del
    modelo devuelve ÚNICAMENTE lo que es genuinamente del modelo de ML.
    'nivel_riesgo_actual' y 'alerta_roja' NO se incluyen en la salida --
    esos los calcula evaluateRisk() del lado de Kuni.

    IMPORTANTE -- EL CONTRATO DE ENTRADA DE KUNI NO CAMBIA: el vector que
    Kuni envía sigue siendo exactamente el mismo (FEATURE_COLS, 17 campos).
    El 'risk_score' que necesita el modelo se calcula AQUÍ ADENTRO, con el
    motor de reglas interno, sin pedirle nada nuevo a Kuni.

    Este modelo predice 'descompensacion_futura' -- ya NO depende del
    delta de risk_score, por lo que no tiene el efecto techo severo de
    versiones anteriores. SIGUE existiendo un efecto techo más pequeño
    en los criterios categóricos (glucosa/PA ya en su categoría máxima),
    que aquí se detecta explícitamente y se anota en la respuesta en vez
    de dejar que una probabilidad baja parezca contradecir el riesgo real.
    """
    fila = pd.DataFrame([paciente_row])
    fila = calcular_riesgo_actual(fila)  # uso interno, no se expone al exterior
    paciente_row_completo = {**paciente_row, 'risk_score': fila['risk_score'].iloc[0]}

    techo = detectar_techo_categoria(paciente_row)
    X_pred = pd.DataFrame([paciente_row_completo])[FEATURE_COLS_MODELO_B].fillna(-1)

    # Con calibración estratificada, el modelo YA distingue razonablemente
    # bien dentro del grupo "en techo" (AUC ~0.78, similar al del grupo
    # general) -- ya no hace falta descartar el número, solo calibrarlo
    # con la curva correcta para ese grupo.
    if isinstance(modelo_prediccion_futura, ModeloCalibradoEstratificado):
        prob_descompensacion = modelo_prediccion_futura.predict_proba(
            X_pred, en_techo=techo['en_techo_maximo']
        )[0, 1]
    else:
        prob_descompensacion = modelo_prediccion_futura.predict_proba(X_pred)[0, 1]

    if techo['en_techo_maximo']:
        # Ya está en el peor escenario clínico posible para esta variable
        # -> el nivel SIEMPRE se reporta como alto, sin importar el número.
        # La probabilidad calibrada aquí ya no significa "¿va a llegar a
        # este nivel?" (ya llegó) sino "¿qué tan probable es que seguir
        # empeorando MÁS ALLÁ de este punto?" -- información real, no se
        # descarta, pero se explica con un mensaje en lenguaje clínico.
        nivel_predicho = "alto"

        etiquetas_motivo = {
            'glucosa': "glucosa en nivel de crisis",
            'pa': "presión arterial en nivel de crisis",
            'complicacion': "ya tiene una complicación grave diagnosticada",
        }
        motivos = []
        if techo['techo_glucosa']:
            motivos.append(etiquetas_motivo['glucosa'])
        if techo['techo_pa']:
            motivos.append(etiquetas_motivo['pa'])
        if techo['techo_complicacion_grave']:
            motivos.append(etiquetas_motivo['complicacion'])
        razon = motivos[0] if len(motivos) == 1 else "; ".join(motivos[:-1]) + " y " + motivos[-1]

        mensaje = (f"⚠️ Riesgo máximo ({razon}). Este paciente ya está en el peor "
                   f"escenario clínico posible para esta variable. Probabilidad estimada "
                   f"de que continúe empeorando aún más: {prob_descompensacion*100:.0f}%.")
    else:
        if prob_descompensacion < 0.30:
            nivel_predicho = "bajo"
        elif prob_descompensacion < 0.60:
            nivel_predicho = "moderado"
        else:
            nivel_predicho = "alto"
        mensaje = None

    resultado = {
        'probabilidad_descompensacion': round(float(prob_descompensacion), 3),
        'nivel_predicho': nivel_predicho,
        'model_version': model_version,
        'datos_suficientes': datos_suficientes or {},
    }
    if mensaje:
        resultado['mensaje'] = mensaje
    return resultado


# =================================================================================
# FUNCIÓN DE ALERTA EN PRODUCCIÓN (así se usarían ambos modelos juntos)
# =================================================================================
def generar_alerta(paciente_row: dict, modelo_riesgo_actual, modelo_prediccion_futura,
                    umbral_prediccion: float = 0.45,
                    estado_tratamiento_dm: str = 'estable_oral',
                    estado_tratamiento_has: str = 'controlada',
                    dias_desde_ultimo_reporte: int = 0) -> dict:
    """Dado el registro más reciente de un paciente, devuelve el tipo de
    alerta que debe mostrarse en el tablero del médico. Combina las dos
    capas como capas INDEPENDIENTES (no exige que ambas coincidan).

    estado_tratamiento_dm: 'estable_oral' | 'ajuste_insulina' | 'insulina_estable_hba1c'
        -> lo define el MÉDICO en el expediente, no se infiere del bot.
    dias_desde_ultimo_reporte: días transcurridos desde la última medición
        recibida por el bot (de cualquier tipo). Alimenta la regla de
        "brecha de monitoreo".
    """
    fila = pd.DataFrame([{
        **paciente_row,
        'estado_tratamiento_dm': estado_tratamiento_dm,
        'estado_tratamiento_has': estado_tratamiento_has,
        'dias_desde_ultimo_reporte': dias_desde_ultimo_reporte,
    }])
    fila = calcular_riesgo_actual(fila)
    nivel_actual = fila['nivel_riesgo'].iloc[0]
    brecha_excedida = bool(fila['brecha_monitoreo_excedida'].iloc[0])

    X_pred = pd.DataFrame([paciente_row])[FEATURE_COLS].fillna(-1)
    X_pred['nivel_riesgo_ord'] = {'bajo': 0, 'moderado': 1, 'alto': 2}[nivel_actual]
    prob_empeora = modelo_prediccion_futura.predict_proba(X_pred)[0, 1]

    alerta_roja = (nivel_actual == 'alto') or (brecha_excedida and estado_tratamiento_dm == 'ajuste_insulina')
    alerta_naranja = (prob_empeora >= umbral_prediccion) or (brecha_excedida and not alerta_roja)

    return {
        'nivel_riesgo_actual': nivel_actual,
        'probabilidad_empeoramiento_futuro': round(float(prob_empeora), 3),
        'brecha_monitoreo_excedida': brecha_excedida,
        'alerta_roja': bool(alerta_roja),
        'alerta_naranja_predictiva': bool(alerta_naranja),
    }


# =================================================================================
# MAIN
# =================================================================================
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='Ruta al CSV del dataset')
    parser.add_argument('--out', default='./salidas', help='Carpeta de salida')
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    print("Cargando y anonimizando...")
    df = cargar_y_anonimizar(args.input)

    print("Manejando datos faltantes...")
    df = manejar_faltantes(df)

    print("Construyendo variables (feature engineering)...")
    df = construir_features(df)

    print("Calculando riesgo actual (Modelo A - reglas GPC)...")
    df = calcular_riesgo_actual(df)
    df.to_parquet(os.path.join(args.out, "dataset_con_riesgo.parquet"), index=False)

    print("Entrenando Modelo A (clasificador de riesgo actual)...")
    reporte_a, train_ids, test_ids = entrenar_modelo_riesgo_actual(df, args.out)

    print("Entrenando Modelo B (predicción de empeoramiento futuro)...")
    reporte_b, auc_b, _ = entrenar_modelo_prediccion_futura(df, train_ids, test_ids, args.out)

    print("Entrenando modelos de trayectoria (glucosa, PA sistólica, PA diastólica)...")
    entrenar_modelos_trayectoria(df, train_ids, args.out)

    with open(os.path.join(args.out, "reporte_metricas.txt"), "w") as f:
        f.write("MODELO A - Clasificador de riesgo actual (base de alertas rojas)\n")
        f.write(reporte_a + "\n\n")
        f.write(f"MODELO B - Predicción de empeoramiento futuro (base de alertas naranjas)\n")
        f.write(f"AUC-ROC: {auc_b:.3f}\n")
        f.write(reporte_b)

    print(f"\nListo. Revisa la carpeta: {args.out}")
    print(" - dataset_con_riesgo.parquet")
    print(" - modelo_riesgo_actual.joblib")
    print(" - modelo_prediccion_futura.joblib")
    print(" - reporte_metricas.txt")


if __name__ == "__main__":
    main()
