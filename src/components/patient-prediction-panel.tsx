import type { DashboardPatient } from "@/lib/domain/dashboard";
import { getPatientPrediction } from "@/lib/ml/predict-patient";
import type { MlFeatureVector } from "../../domain-core/src/lib/ml/client";
import { formatInTimeZone } from "date-fns-tz";
import { PatientHistoryCharts } from "./patient-history-chart";
import { PatientTrajectoryCharts } from "./patient-trajectory-chart";
import { PredictionRefreshButton } from "./prediction-refresh-button";

const levelStyle = {
  bajo: "border-emerald-200 bg-emerald-50 text-emerald-800",
  moderado: "border-amber-200 bg-amber-50 text-amber-800",
  alto: "border-rose-200 bg-rose-50 text-rose-800",
} as const;

const levelLabel = {
  bajo: "Bajo",
  moderado: "Moderado",
  alto: "Alto",
} as const;

function DataSignal({ label, complete }: { label: string; complete: boolean }) {
  return (
    <li className={`rounded-lg border px-2.5 py-2 text-xs font-semibold ${complete ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
      <span aria-hidden="true">{complete ? "✓" : "–"}</span> {label}
    </li>
  );
}

function ModelInputs({ vector }: { vector: MlFeatureVector }) {
  const rows = [
    ["Edad", vector.age_at_wx, "age_at_wx"],
    ["Diabetes", vector.diabetes_dx ? "Sí" : "No", "diabetes_dx"],
    ["Hipertensión", vector.hypertension_dx ? "Sí" : "No", "hypertension_dx"],
    ["Comorbilidad DM + HTA", vector.comorbido_dm_has ? "Sí" : "No", "comorbido_dm_has"],
    ["Promedio sistólico", vector.fn_ta_systolic_mean == null ? "Sin dato" : `${vector.fn_ta_systolic_mean} mmHg`, "fn_ta_systolic_mean"],
    ["Promedio diastólico", vector.fn_ta_diastolic_mean == null ? "Sin dato" : `${vector.fn_ta_diastolic_mean} mmHg`, "fn_ta_diastolic_mean"],
    ["Tendencia sistólica", `${vector.tendencia_sistolica} mmHg/día`, "tendencia_sistolica"],
    ["Tendencia diastólica", `${vector.tendencia_diastolica} mmHg/día`, "tendencia_diastolica"],
    ["Presión empeorando", vector.pa_empeorando ? "Sí" : "No", "pa_empeorando"],
    ["Promedio glucosa en ayuno", vector.in_glucose_mean == null ? "Sin dato" : `${vector.in_glucose_mean} mg/dL`, "in_glucose_mean"],
    ["Tendencia de glucosa", `${vector.tendencia_glucosa} mg/dL/día`, "tendencia_glucosa"],
    ["Glucosa empeorando", vector.glucosa_empeorando ? "Sí" : "No", "glucosa_empeorando"],
    ["Adherencia antidiabéticos", `${Math.round(vector.adherencia_antidiabeticos * 100)}%`, "adherencia_antidiabeticos"],
    ["Adherencia antihipertensivos", `${Math.round(vector.adherencia_antihipertensivos * 100)}%`, "adherencia_antihipertensivos"],
    ["Complicaciones registradas", vector.num_complicaciones_dm, "num_complicaciones_dm"],
    ["Tiene complicación", vector.tiene_complicacion_dm ? "Sí" : "No", "tiene_complicacion_dm"],
    ["Complicación grave", vector.complicacion_grave_dm ? "Sí" : "No", "complicacion_grave_dm"],
  ] as const;

  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <summary className="cursor-pointer text-sm font-bold text-slate-800">Ver las 17 variables enviadas al modelo</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value, code]) => (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2" key={code}>
            <dt className="text-[11px] font-bold text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm font-extrabold text-slate-900">{value}</dd>
            <code className="mt-1 block break-all text-[9px] text-slate-400">{code}</code>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Esta lista acredita qué recibió el modelo, pero no atribuye causalidad. La versión desplegada no entrega importancia por variable ni valores SHAP.
      </p>
    </details>
  );
}

export function PatientPredictionSkeleton() {
  return (
    <section aria-busy="true" aria-label="Calculando estimación de seguimiento" className="clinical-panel overflow-hidden p-5 lg:col-span-3">
      <span className="sr-only" role="status">Calculando estimación de seguimiento…</span>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="skeleton-bone h-4 w-36" />
          <div className="skeleton-bone h-6 w-60" />
          <div className="skeleton-bone h-3 w-80 max-w-full" />
        </div>
        <div className="skeleton-bone h-16 w-20" />
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <div className="skeleton-bone h-10" />
        <div className="skeleton-bone h-10" />
        <div className="skeleton-bone h-10" />
      </div>
    </section>
  );
}

export async function PatientPredictionPanel({ patient, asOf, timezone }: { patient: DashboardPatient; asOf: string; timezone: string }) {
  const { prediction, trajectory, gaps, vector } = await getPatientPrediction(patient, new Date(asOf));

  // The model is optional. Keep the panel visible, but never turn an absent
  // endpoint, timeout, or malformed response into a fabricated prediction.
  if (prediction.status === "unavailable") {
    return (
      <section aria-labelledby="future-risk-title" className="clinical-panel overflow-hidden border-slate-200 p-5 lg:col-span-3 motion-safe:animate-[kuni-rise_360ms_ease-out_both] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 id="future-risk-title" className="text-lg font-extrabold tracking-tight text-slate-900">Panel predictivo <span className="text-sky-700">(IA)</span></h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Este panel estará disponible cuando el servicio de predicción responda. La prioridad clínica actual sigue usando reglas verificables.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-600">
            Servicio no disponible
          </span>
        </div>
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-lg text-slate-500 shadow-sm">⌁</span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Sin estimación publicada</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                No se muestra un porcentaje hasta contar con una respuesta válida del modelo. Este estado no es una alerta ni una evaluación de bajo riesgo.
              </p>
            </div>
          </div>
        </div>
        <ModelInputs vector={vector} />
        <PatientHistoryCharts measurements={patient.measurements} asOf={asOf} timezone={timezone} />
      </section>
    );
  }

  const isCeiling = prediction.status === "ceiling";
  // En techo de riesgo la probabilidad puede venir (v7+, calibrada aparte
  // para ese grupo) o no (v4). Ambos casos son válidos — se muestra el
  // número solo cuando el servicio de verdad lo mandó.
  const probability = prediction.probability == null ? null : Math.round(prediction.probability * 100);

  return (
    <section aria-labelledby="future-risk-title" className="clinical-panel overflow-hidden border-slate-200 p-5 lg:col-span-3 motion-safe:animate-[kuni-rise_360ms_ease-out_both] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 id="future-risk-title" className="text-lg font-extrabold tracking-tight text-slate-900">Panel predictivo <span className="text-sky-700">(IA)</span></h2>
          <p className="mt-1 text-xs font-medium text-slate-500">RF30 · estimación adicional que no modifica la prioridad clínica</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">No validado clínicamente</span>
      </div>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="text-slate-900">
            {probability != null ? <strong className="font-mono-data text-4xl font-black tracking-tight">{probability}%</strong> : <strong className="text-2xl font-black">Sin porcentaje</strong>}
            <span className="ml-2 text-sm font-bold text-slate-600">prob. de descompensación</span>
          </p>
          <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${levelStyle[prediction.level]}`}>
            Nivel {levelLabel[prediction.level].toLowerCase()}
          </span>
        </div>
        <PredictionRefreshButton />
      </div>

      {isCeiling ? (
        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-relaxed text-rose-900">
          <strong>Techo de riesgo clínico.</strong> {prediction.message}
          {probability != null ? (
            <p className="mt-1 text-xs text-rose-800">
              El {probability}% no es &ldquo;¿llegará a este nivel?&rdquo; —ya llegó—, sino la probabilidad estimada de que siga empeorando más allá de este punto.
            </p>
          ) : null}
        </div>
      ) : null}

      <PatientHistoryCharts measurements={patient.measurements} asOf={asOf} timezone={timezone} />

      {trajectory.status === "available" ? (
        <PatientTrajectoryCharts
          glucose={trajectory.glucose}
          systolicBp={trajectory.systolicBp}
          diastolicBp={trajectory.diastolicBp}
          latestGlucoseMgDl={patient.latestGlucose?.glucoseMgDl ?? null}
          latestSystolicMmHg={patient.latestBloodPressure?.systolicMmHg ?? null}
          latestDiastolicMmHg={patient.latestBloodPressure?.diastolicMmHg ?? null}
        />
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          La versión desplegada todavía no publica la trayectoria futura a tres pasos. La gráfica histórica superior sigue siendo observada y la predicción principal permanece disponible.
        </div>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Cobertura de datos enviada al modelo</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          <DataSignal complete={prediction.sufficiency.glucosaAyuno} label="Glucosa en ayuno" />
          <DataSignal complete={prediction.sufficiency.glucosaPostprandial} label="Glucosa postprandial" />
          <DataSignal complete={prediction.sufficiency.presionArterial} label="Presión arterial" />
        </ul>
      </div>

      <ModelInputs vector={vector} />

      {gaps.length ? (
        <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950">
          <summary className="cursor-pointer font-bold">{gaps.length} dato{gaps.length === 1 ? " pendiente" : "s pendientes"} en el vector</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
            {gaps.map((gap) => <li key={gap.feature}>{gap.reason}</li>)}
          </ul>
        </details>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>Última predicción: {formatInTimeZone(new Date(asOf), timezone, "dd/MM/yyyy HH:mm")}</p>
        <p>{prediction.modelVersion ? `Modelo ${prediction.modelVersion}` : "Versión del modelo no informada"}</p>
      </div>
    </section>
  );
}
