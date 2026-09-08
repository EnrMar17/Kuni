"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MlTrajectoryStep } from "../../domain-core/src/lib/ml/client";

/**
 * Gráfica de una sola variable proyectada (glucosa o PA) — línea de valor
 * esperado + banda sombreada del rango (percentiles 10/90 del modelo de
 * trayectoria, v7). Vinculada al MISMO vector que produjo el resultado del
 * panel de riesgo futuro (RF30): no es un modelo independiente, es la misma
 * predicción desdoblada en pasos.
 *
 * "Paso 0" es la última medición real del paciente (sin rango: es un dato
 * observado, no una proyección) para dar contexto visual de dónde arranca
 * la trayectoria proyectada.
 */
function TrajectoryChart({
  title,
  unit,
  baseline,
  steps,
  color,
}: {
  title: string;
  unit: string;
  baseline: number | null;
  steps: MlTrajectoryStep[];
  color: string;
}) {
  const data = [
    ...(baseline != null ? [{ step: 0, esperado: baseline, rango: [baseline, baseline] as [number, number], observado: true }] : []),
    ...steps.map((s) => ({ step: s.step, esperado: s.expected, rango: [s.rangeMin, s.rangeMax] as [number, number], observado: false })),
  ];

  if (data.length < 2) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-1 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="step"
              tickFormatter={(step: number) => (step === 0 ? "Actual" : `+${step}`)}
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={{ stroke: "#cbd5e1" }}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              formatter={(value, name) => {
                if (name === "rango" && Array.isArray(value)) {
                  return [`${value[0]} – ${value[1]} ${unit}`, "Rango estimado"];
                }
                return [`${value} ${unit}`, "Valor esperado"];
              }}
              labelFormatter={(label) => (label === 0 ? "Última medición" : `Paso +${label}`)}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Area type="monotone" dataKey="rango" stroke="none" fill={color} fillOpacity={0.15} isAnimationActive={false} />
            <Line type="monotone" dataKey="esperado" stroke={color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PatientTrajectoryCharts({
  glucose,
  systolicBp,
  diastolicBp,
  latestGlucoseMgDl,
  latestSystolicMmHg,
  latestDiastolicMmHg,
}: {
  glucose: MlTrajectoryStep[];
  systolicBp: MlTrajectoryStep[];
  diastolicBp: MlTrajectoryStep[];
  latestGlucoseMgDl: number | null;
  latestSystolicMmHg: number | null;
  latestDiastolicMmHg: number | null;
}) {
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
        Proyección a 3 mediciones (mismo modelo, informativo)
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Cada paso encadena la predicción anterior — la incertidumbre crece con la distancia. No sustituye una medición real ni cambia la prioridad clínica.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <TrajectoryChart title="Glucosa (mg/dL)" unit="mg/dL" baseline={latestGlucoseMgDl} steps={glucose} color="#6366f1" />
        <TrajectoryChart title="PA sistólica (mmHg)" unit="mmHg" baseline={latestSystolicMmHg} steps={systolicBp} color="#e11d48" />
        <TrajectoryChart title="PA diastólica (mmHg)" unit="mmHg" baseline={latestDiastolicMmHg} steps={diastolicBp} color="#d97706" />
      </div>
    </div>
  );
}
