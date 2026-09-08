"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addPatientComplication,
  deactivatePatientComplication,
  markUrgent,
  resolveAlert,
  correctMeasurement,
  adjustPrescription,
} from "@/actions/clinical";
import type { DashboardAlert, DashboardComplication, DashboardMeasurement, DashboardPrescription } from "@/lib/domain/dashboard";

function ActionMessage({ message }: { message: string | null }) {
  return message ? <p className="mt-3 text-sm text-rose-700" role="alert">{message}</p> : null;
}

export function AlertActions({ alert }: { alert: DashboardAlert }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"acknowledged" | "resolved" | "dismissed">("acknowledged");
  const [message, setMessage] = useState<string | null>(null);

  const submitResolution = () => startTransition(async () => {
    const result = await resolveAlert({ patientId: alert.patientId, alertId: alert.id, expectedUpdatedAt: alert.updatedAt, status, note: reason });
    if (result.error) return setMessage(result.error.message);
    setExpanded(false);
    setReason("");
    setMessage("La alerta se actualizó.");
    router.refresh();
  });
  const submitUrgent = () => startTransition(async () => {
    const result = await markUrgent({ patientId: alert.patientId, eventId: crypto.randomUUID(), reason });
    if (result.error) return setMessage(result.error.message);
    setReason("");
    setMessage("Se registró la urgencia clínica.");
    router.refresh();
  });

  return <div className="w-full sm:w-auto"><button aria-expanded={expanded} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700" onClick={() => { setExpanded((value) => !value); setMessage(null); }} type="button">Atender alerta</button>{expanded ? <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><label className="block text-sm font-bold text-slate-700">Estado<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" disabled={isPending} onChange={(event) => setStatus(event.target.value as typeof status)} value={status}><option value="acknowledged">Reconocida</option><option value="resolved">Resuelta</option><option value="dismissed">Descartada</option></select></label><label className="mt-3 block text-sm font-bold text-slate-700">Motivo<textarea className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" disabled={isPending} onChange={(event) => setReason(event.target.value)} rows={3} value={reason} /></label><div className="mt-3 flex flex-wrap gap-2"><button className="clinical-button clinical-button-primary" disabled={isPending || !reason.trim()} onClick={submitResolution} type="button">{isPending ? "Guardando…" : "Guardar atención"}</button><button className="clinical-button" disabled={isPending || !reason.trim()} onClick={submitUrgent} type="button">Marcar urgencia</button></div></div> : null}<ActionMessage message={message} /></div>;
}

const complicationCodes = ["E110", "E111", "E112", "E113", "E114", "E115", "E116", "E117", "E118", "E119"] as const;

export function ComplicationPanel({ patientId, complications }: { patientId: string; complications: DashboardComplication[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState<(typeof complicationCodes)[number]>("E119");
  const [diagnosedOn, setDiagnosedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [removing, setRemoving] = useState<DashboardComplication | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const add = () => startTransition(async () => {
    const result = await addPatientComplication({ patientId, code, diagnosedOn: diagnosedOn || null, notes: notes || null });
    if (result.error) return setMessage(result.error.message);
    setNotes(""); setDiagnosedOn(""); setMessage("Complicación registrada."); router.refresh();
  });
  const remove = () => {
    if (!removing) return;
    startTransition(async () => {
      const result = await deactivatePatientComplication({ patientId, complicationId: removing.id, expectedUpdatedAt: removing.updatedAt, reason });
      if (result.error) return setMessage(result.error.message);
      setRemoving(null); setReason(""); setMessage("Complicación retirada."); router.refresh();
    });
  };

  return <section className="clinical-panel p-5 lg:col-span-3"><h2 className="text-base font-extrabold text-slate-900">Complicaciones de diabetes</h2><p className="mt-1 text-sm text-slate-500">RF28. E119 significa que se revisó y no hay complicaciones; no puede coexistir con otro código vigente.</p><ul className="mt-4 space-y-2">{complications.map((item) => <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3" key={item.id}><span className="text-sm font-semibold text-slate-800">{item.code}{item.diagnosedOn ? ` · ${item.diagnosedOn}` : ""}{item.notes ? ` · ${item.notes}` : ""}</span><button className="text-sm font-bold text-rose-700" disabled={isPending} onClick={() => { setRemoving(item); setMessage(null); }} type="button">Retirar</button></li>)}{!complications.length ? <li className="text-sm text-slate-500">Sin registro de revisión de complicaciones.</li> : null}</ul>{removing ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><label className="block text-sm font-bold text-slate-700">Motivo para retirar {removing.code}<textarea className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" disabled={isPending} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><div className="mt-2 flex gap-2"><button className="clinical-button" disabled={isPending || !reason.trim()} onClick={remove} type="button">Confirmar retiro</button><button className="text-sm font-semibold" disabled={isPending} onClick={() => setRemoving(null)} type="button">Cancelar</button></div></div> : <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm font-bold text-slate-700">Código<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" disabled={isPending} onChange={(event) => setCode(event.target.value as typeof code)} value={code}>{complicationCodes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-sm font-bold text-slate-700">Fecha<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" disabled={isPending} onChange={(event) => setDiagnosedOn(event.target.value)} type="date" value={diagnosedOn} /></label><label className="text-sm font-bold text-slate-700">Notas<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" disabled={isPending} onChange={(event) => setNotes(event.target.value)} value={notes} /></label><button className="clinical-button clinical-button-primary justify-self-start" disabled={isPending} onClick={add} type="button">{isPending ? "Guardando…" : "Registrar"}</button></div>}<ActionMessage message={message} /></section>;
}

export function MeasurementCorrection({ patientId, measurement }: { patientId: string; measurement: DashboardMeasurement }) {
  const router = useRouter(); const [isPending, startTransition] = useTransition(); const [reason, setReason] = useState(""); const [message, setMessage] = useState<string | null>(null);
  const [value, setValue] = useState(measurement.kind === "glucose" ? String(measurement.glucoseMgDl ?? "") : `${measurement.systolicMmHg ?? ""}/${measurement.diastolicMmHg ?? ""}`);
  const save = () => startTransition(async () => {
    if (!measurement.updatedAt) return setMessage("Esta lectura no tiene token de concurrencia; actualiza la ficha.");
    const observedAt = measurement.observedAt;
    const input = measurement.kind === "glucose" ? { kind: "glucose" as const, patientId, measurementId: measurement.id, expectedUpdatedAt: measurement.updatedAt, observedAt, glucoseMgDl: Number(value), context: measurement.context as "fasting" | "before_meal" | "after_meal" | "random" | "unspecified", reason } : (() => { const [systolicMmHg, diastolicMmHg] = value.split("/").map(Number); return { kind: "blood_pressure" as const, patientId, measurementId: measurement.id, expectedUpdatedAt: measurement.updatedAt!, observedAt, systolicMmHg, diastolicMmHg, reason }; })();
    const result = await correctMeasurement(input); if (result.error) return setMessage(result.error.message); setMessage("Medición corregida."); router.refresh();
  });
  return <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><label className="block text-xs font-bold text-slate-600">Corregir {measurement.kind === "glucose" ? "glucosa (mg/dL)" : "presión (sistólica/diastólica)"}<input className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" disabled={isPending} onChange={(event) => setValue(event.target.value)} value={value} /></label><label className="mt-2 block text-xs font-bold text-slate-600">Motivo<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" disabled={isPending} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><button className="mt-2 text-sm font-bold text-indigo-700" disabled={isPending || !reason.trim()} onClick={save} type="button">{isPending ? "Guardando…" : "Guardar corrección"}</button><ActionMessage message={message} /></div>;
}

export function PrescriptionAdjustment({ patientId, prescription }: { patientId: string; prescription: DashboardPrescription }) {
  const router = useRouter(); const [isPending, startTransition] = useTransition(); const [doseText, setDoseText] = useState(prescription.doseText); const [instructions, setInstructions] = useState(prescription.instructions ?? ""); const [reason, setReason] = useState(""); const [message, setMessage] = useState<string | null>(null);
  const save = () => startTransition(async () => {
    const schedules = prescription.schedules.flatMap((schedule) => schedule.weekdays.map((weekday) => ({ weekday, localTime: schedule.localTime.slice(0, 5) })));
    const result = await adjustPrescription({ patientId, prescriptionId: prescription.id, expectedVersion: prescription.version, expectedUpdatedAt: prescription.updatedAt, medicationId: prescription.medicationId, doseText, instructions, endsAt: prescription.endDate, schedules, reason });
    if (result.error) return setMessage(result.error.message); setMessage("Ajuste de receta registrado."); router.refresh();
  });
  return <div className="mt-3 border-t border-indigo-100 pt-3"><label className="block text-xs font-bold text-slate-600">Dosis<input className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" disabled={isPending} onChange={(event) => setDoseText(event.target.value)} value={doseText} /></label><label className="mt-2 block text-xs font-bold text-slate-600">Indicaciones<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" disabled={isPending} onChange={(event) => setInstructions(event.target.value)} rows={2} value={instructions} /></label><label className="mt-2 block text-xs font-bold text-slate-600">Motivo del ajuste<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" disabled={isPending} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><button className="mt-2 text-sm font-bold text-indigo-700" disabled={isPending || !reason.trim() || !doseText.trim() || !instructions.trim()} onClick={save} type="button">{isPending ? "Guardando…" : "Ajustar receta"}</button><ActionMessage message={message} /></div>;
}
