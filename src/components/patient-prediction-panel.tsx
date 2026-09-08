import type { DashboardPatient } from "@/lib/domain/dashboard";
import { getPatientPrediction } from "@/lib/ml/predict-patient";
import { formatInTimeZone } from "date-fns-tz";

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
  const { prediction, gaps } = await getPatientPrediction(patient, new Date(asOf));

  // The model is optional. Keep the panel visible, but never turn an absent
  // endpoint, timeout, or malformed response into a fabricated prediction.
  if (prediction.status === "unavailable") {
    return (
      <section aria-labelledby="future-risk-title" className="clinical-panel overflow-hidden p-5 lg:col-span-3 motion-safe:animate-[kuni-rise_360ms_ease-out_both]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-600">RF30 · estimación adicional</p>
            <h2 id="future-risk-title" className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Riesgo futuro estimado</h2>
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
      </section>
    );
  }

  const isCeiling = prediction.status === "ceiling";
  const probability = isCeiling ? null : Math.round(prediction.probability * 100);

  return (
    <section aria-labelledby="future-risk-title" className="clinical-panel overflow-hidden p-5 lg:col-span-3 motion-safe:animate-[kuni-rise_360ms_ease-out_both]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-600">RF30 · estimación adicional</p>
          <h2 id="future-risk-title" className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Riesgo futuro estimado</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Es un apoyo informativo no validado clínicamente. No modifica la prioridad ni genera alertas.
          </p>
        </div>
        <div className={`min-w-36 rounded-2xl border px-4 py-3 text-center ${levelStyle[prediction.level]}`}>
          <p className="text-[11px] font-extrabold uppercase tracking-wider">Modelo</p>
          <p className="mt-1 text-lg font-black">{levelLabel[prediction.level]}</p>
          {probability != null ? <p className="text-sm font-bold">{probability}%</p> : null}
        </div>
      </div>

      {isCeiling ? (
        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-relaxed text-rose-900">
          <strong>Techo de riesgo clínico.</strong> {prediction.message}
        </div>
      ) : null}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Suficiencia de datos enviada al modelo</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          <DataSignal complete={prediction.sufficiency.glucosaAyuno} label="Glucosa en ayuno" />
          <DataSignal complete={prediction.sufficiency.glucosaPostprandial} label="Glucosa postprandial" />
          <DataSignal complete={prediction.sufficiency.presionArterial} label="Presión arterial" />
        </ul>
      </div>

      {gaps.length ? (
        <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950">
          <summary className="cursor-pointer font-bold">{gaps.length} dato{gaps.length === 1 ? " pendiente" : "s pendientes"} en el vector</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
            {gaps.map((gap) => <li key={gap.feature}>{gap.reason}</li>)}
          </ul>
        </details>
      ) : null}

      <p className="mt-4 text-xs text-slate-500">
        {prediction.modelVersion ? `Modelo ${prediction.modelVersion}` : "Versión del modelo no informada"}
        {` · Datos al ${formatInTimeZone(new Date(asOf), timezone, "dd/MM/yyyy HH:mm")} (${timezone})`}
      </p>
    </section>
  );
}
