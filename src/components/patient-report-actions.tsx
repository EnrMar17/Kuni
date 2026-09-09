"use client";

import Link from "next/link";
import { useState } from "react";

export function PatientReportActions({ patientId }: { patientId: string }) {
  const [busy, setBusy] = useState(false);
  return <nav className="patient-report-actions" aria-label="Acciones del reporte individual">
    <Link className="clinical-button" href={`/pacientes/${patientId}`}>Volver al expediente</Link>
    <button className="clinical-button clinical-button-primary" type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        await document.fonts.ready;
        await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".patient-report-document img")).map(image => image.decode().catch(() => undefined)));
        window.print();
      } finally { setBusy(false); }
    }}>{busy ? "Preparando documento…" : "Imprimir / Guardar PDF"}</button>
  </nav>;
}
