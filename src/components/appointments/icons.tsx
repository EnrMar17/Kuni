// Íconos compartidos por la vista de citas — mismo estilo lineal (stroke,
// 24x24) que ya usan clinical-header.tsx y clinical-dashboard.tsx, pero sin
// duplicar ese set: aquí solo viven los que necesita esta vista.
export type AppointmentIconName =
  | "calendar"
  | "clock"
  | "search"
  | "check"
  | "close"
  | "user"
  | "users"
  | "chevronLeft"
  | "chevronRight"
  | "sparkles"
  | "alert"
  | "note"
  | "phone"
  | "stethoscope"
  | "today";

const paths: Record<AppointmentIconName, React.ReactNode> = {
  calendar: (
    <>
      <path d="M8 3v4m8-4v4M5 10h14" />
      <rect x="4" y="5" width="16" height="16" rx="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  sparkles: (
    <>
      <path d="M12 3v4m0 10v4M3 12h4m10 0h4" />
      <path d="m6.3 6.3 2 2m7.4 7.4 2 2m0-11.4-2 2m-7.4 7.4-2 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 9v2m0 4h.01" />
      <path d="M5.1 19h13.8a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.37 16a2 2 0 0 0 1.73 3Z" />
    </>
  ),
  note: (
    <>
      <path d="M9 3h6l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 12h6M9 16h6M9 8h2" />
    </>
  ),
  phone: (
    <path d="M6.6 10.8a15.4 15.4 0 0 0 6.6 6.6l2.2-2.2a1.5 1.5 0 0 1 1.5-.37 11 11 0 0 0 3.4.55 1.5 1.5 0 0 1 1.5 1.5V20a1.5 1.5 0 0 1-1.5 1.5A17.5 17.5 0 0 1 2.5 4 1.5 1.5 0 0 1 4 2.5h3.1a1.5 1.5 0 0 1 1.5 1.5 11 11 0 0 0 .55 3.4 1.5 1.5 0 0 1-.38 1.5Z" />
  ),
  stethoscope: (
    <>
      <path d="M5 4v6a4 4 0 0 0 8 0V4" />
      <path d="M9 14v2a5 5 0 0 0 10 0v-1.5" />
      <circle cx="19" cy="10.5" r="1.75" />
    </>
  ),
  today: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4m8-4v4M4 10h16" />
      <circle cx="12" cy="15" r="2" fill="currentColor" stroke="none" />
    </>
  ),
};

export function Icon({
  name,
  className = "size-4",
  style,
}: {
  name: AppointmentIconName;
  className?: string;
  /** Ancho/alto en línea — gana sobre cualquier clase CSS que compita por el
   * tamaño (p. ej. un estilo global de botones que fuerce otro layout). */
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      style={style}
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}
