/**
 * Anillo de progreso al estilo Tremor `ProgressCircle` — SVG puro, sin
 * dependencias. Traducido a mano (no viene de @tremor/react: ver la nota
 * en statistics-view.tsx sobre por qué no se instaló el paquete).
 */
export function ProgressCircle({
  value,
  size = 60,
  strokeWidth = 6,
  color = "#0a4470",
  trackColor = "#e2e8f0",
  label,
}: {
  /** 0–100. Valores fuera de rango se recortan. */
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg height={size} width={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.2,.75,.25,1)" }}
        />
      </svg>
      <span className="absolute font-mono-data text-xs font-extrabold text-slate-900">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
