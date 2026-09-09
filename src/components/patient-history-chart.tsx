"use client";

import { formatInTimeZone } from "date-fns-tz";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardMeasurement } from "@/lib/domain/dashboard";

const DAY_MS = 86_400_000;

type HistoryPoint = {
  timestamp: number;
  fasting?: number;
  postprandial?: number;
  systolic?: number;
  diastolic?: number;
};

function observedHistory(measurements: DashboardMeasurement[], start: number, end: number): HistoryPoint[] {
  return measurements
    .filter((measurement) => {
      const timestamp = Date.parse(measurement.observedAt);
      return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
    })
    .map((measurement) => {
      const timestamp = Date.parse(measurement.observedAt);
      if (measurement.kind === "glucose") {
        return {
          timestamp,
          ...(measurement.context === "fasting" ? { fasting: measurement.glucoseMgDl ?? undefined } : {}),
          ...(measurement.context === "after_meal" ? { postprandial: measurement.glucoseMgDl ?? undefined } : {}),
        };
      }
      return {
        timestamp,
        systolic: measurement.systolicMmHg ?? undefined,
        diastolic: measurement.diastolicMmHg ?? undefined,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

function HistoryTooltip({ active, payload, label, timezone, unit }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: number;
  timezone: string;
  unit: string;
}) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg">
      <p className="font-bold text-slate-700">{formatInTimeZone(new Date(label), timezone, "dd MMM yyyy, HH:mm")}</p>
      {payload.map((item) => (
        <p className="mt-1" key={item.name} style={{ color: item.color }}>
          {item.name}: <strong>{item.value} {unit}</strong>
        </p>
      ))}
    </div>
  );
}

function HistoricalChart({
  title,
  data,
  start,
  end,
  cutoff,
  timezone,
  unit,
  lines,
}: {
  title: string;
  data: HistoryPoint[];
  start: number;
  end: number;
  cutoff: number;
  timezone: string;
  unit: string;
  lines: Array<{ key: "fasting" | "postprandial" | "systolic" | "diastolic"; label: string; color: string }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <ReferenceArea x1={cutoff} x2={end} fill="#dbeafe" fillOpacity={0.38} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={[start, end]}
              scale="time"
              tickFormatter={(timestamp: number) => formatInTimeZone(new Date(timestamp), timezone, "dd MMM")}
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={{ stroke: "#cbd5e1" }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={42} />
            <Tooltip content={<HistoryTooltip timezone={timezone} unit={unit} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PatientHistoryCharts({ measurements, asOf, timezone }: {
  measurements: DashboardMeasurement[];
  asOf: string;
  timezone: string;
}) {
  const end = Date.parse(asOf);
  const start = end - 90 * DAY_MS;
  const cutoff = end - 30 * DAY_MS;
  const data = observedHistory(measurements, start, end);
  if (!data.length) return null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Historia observada de 90 días</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Son mediciones registradas, no predicciones. El fondo azul marca los últimos 30 días usados para calcular medias y tendencias del vector RF29.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <HistoricalChart
          title="Glucosa"
          data={data}
          start={start}
          end={end}
          cutoff={cutoff}
          timezone={timezone}
          unit="mg/dL"
          lines={[
            { key: "fasting", label: "Ayuno", color: "#2563eb" },
            { key: "postprandial", label: "Postprandial", color: "#7c3aed" },
          ]}
        />
        <HistoricalChart
          title="Presión arterial"
          data={data}
          start={start}
          end={end}
          cutoff={cutoff}
          timezone={timezone}
          unit="mmHg"
          lines={[
            { key: "systolic", label: "Sistólica", color: "#e11d48" },
            { key: "diastolic", label: "Diastólica", color: "#d97706" },
          ]}
        />
      </div>
    </div>
  );
}
