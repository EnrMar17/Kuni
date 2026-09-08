"""
Módulo compartido: envoltorios de modelo calibrado.
Debe vivir en su propio archivo (no dentro de un script de entrenamiento)
para que joblib pueda cargarlo correctamente desde otros scripts/servicios.
"""
import numpy as np


class ModeloCalibrado:
    """Envuelve un modelo base (ej. GradientBoostingClassifier) + un
    calibrador (ej. IsotonicRegression) para que se comporte como un
    modelo normal de scikit-learn (mismo método predict_proba)."""

    def __init__(self, base, calibrador):
        self.base = base
        self.calibrador = calibrador

    def predict_proba(self, X):
        proba_cruda = self.base.predict_proba(X)[:, 1]
        proba_cal = self.calibrador.predict(proba_cruda)
        return np.column_stack([1 - proba_cal, proba_cal])


class ModeloCalibradoEstratificado:
    """Igual que ModeloCalibrado, pero usa DOS curvas de calibración
    distintas según el grupo del paciente ('en_techo' o 'sin_techo').

    Por qué: el mismo modelo base YA distingue razonablemente bien dentro
    del grupo 'en techo' (AUC ~0.78), pero una sola curva de calibración
    para toda la población le asigna números bajos poco intuitivos a ese
    grupo, porque su tasa base de eventos es distinta (~24% vs ~13%).
    Calibrar cada grupo por separado corrige esto sin necesitar un modelo
    nuevo -- el clasificador base es el mismo en ambos casos."""

    def __init__(self, base, calibrador_sin_techo, calibrador_en_techo):
        self.base = base
        self.calibrador_sin_techo = calibrador_sin_techo
        self.calibrador_en_techo = calibrador_en_techo

    def predict_proba(self, X, en_techo=False):
        """en_techo: bool o array de bools, alineado con las filas de X."""
        proba_cruda = self.base.predict_proba(X)[:, 1]
        en_techo_arr = np.atleast_1d(en_techo)
        if en_techo_arr.shape[0] == 1 and len(proba_cruda) > 1:
            en_techo_arr = np.repeat(en_techo_arr, len(proba_cruda))

        proba_cal = np.where(
            en_techo_arr,
            self.calibrador_en_techo.predict(proba_cruda),
            self.calibrador_sin_techo.predict(proba_cruda),
        )
        return np.column_stack([1 - proba_cal, proba_cal])
