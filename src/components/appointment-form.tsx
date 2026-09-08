"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DashboardData } from "@/lib/domain/dashboard";
import { dateTime } from "@/components/dashboard/presentation";

type AppointmentDraft = { patientId: string; date: string; time: string; urgency: "routine" | "urgent"; reason: string };

function validStart(date: string, time: string, timezone: string) {
  const local = date + "T" + time;
  const instant = fromZonedTime(local, timezone);
  return Number.isFinite(instant.getTime()) && instant.getTime() > Date.now()
    && formatInTimeZone(instant, timezone, "yyyy-MM-dd'T'HH:mm") === local;
}

export function AppointmentForm({ data }: { data: DashboardData }) {
  const [preview, setPreview] = useState<AppointmentDraft | null>(null);
  const { register, handleSubmit, getValues, reset, formState: { errors } } = useForm<AppointmentDraft>({
    mode: "onTouched", defaultValues: { patientId: "", date: "", time: "", urgency: "routine", reason: "" },
  });
  const props = (name: keyof AppointmentDraft) => ({ "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? name + "-error" : undefined });
  const error = (name: keyof AppointmentDraft) => errors[name] ? <span role="alert" id={name + "-error"} className="field-error">{errors[name]?.message}</span> : null;
  return <form className="clinical-panel overflow-hidden self-start" noValidate onChangeCapture={() => setPreview(null)} onSubmit={handleSubmit(setPreview)}>
    <div className="border-b border-indigo-100 bg-gradient-to-br from-indigo-100 via-indigo-50 to-white p-6">
      <div className="mb-3 flex items-center gap-3"><span aria-hidden="true" className="section-number">01</span><span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Agenda clínica</span></div>
      <h2 className="text-xl font-extrabold text-slate-900">Programar cita</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Elige al paciente, define el horario y agrega el motivo de seguimiento.</p>
    </div>
    <div className="grid gap-6 p-6">
      <div className="form-fields !grid-cols-1"><label>Paciente<select {...register("patientId", { required: "Selecciona un paciente.", validate: value => data.patients.some(p => p.id === value) || "Selecciona un paciente de este consultorio." })} {...props("patientId")}><option value="">Selecciona un paciente</option>{data.patients.map(p => <option value={p.id} key={p.id}>{p.fullName} · {p.clinicalRecord}</option>)}</select>{error("patientId")}</label></div>
      <div>
        <p className="mb-3 text-xs font-semibold text-slate-500">Horario del consultorio · {data.timezone}</p>
        <div className="form-fields">
          <label>Fecha<input type="date" {...register("date", { required: "Selecciona una fecha." })} {...props("date")} />{error("date")}</label>
          <label>Hora<input type="time" {...register("time", { required: "Selecciona una hora.", validate: value => validStart(getValues("date"), value, data.timezone) || "Elige una fecha y hora futuras válidas." })} {...props("time")} />{error("time")}</label>
        </div>
      </div>
      <fieldset><legend className="mb-3 text-sm font-bold text-slate-700">Tipo de cita</legend><div className="grid gap-3 sm:grid-cols-2">
        <label className="diagnosis-option"><input type="radio" value="routine" {...register("urgency")} /><span><strong className="block">Rutina</strong><span className="field-hint">Control y seguimiento</span></span></label>
        <label className="diagnosis-option"><input type="radio" value="urgent" {...register("urgency")} /><span><strong className="block">Prioritaria</strong><span className="field-hint">Valoración preferente</span></span></label>
      </div></fieldset>
      <div className="form-fields !grid-cols-1"><label>Motivo de la cita<textarea rows={3} placeholder="Por ejemplo: revisión del tratamiento y registros de presión." {...register("reason", { validate: value => value.trim().length >= 3 || "Describe el motivo de la cita.", maxLength: { value: 1000, message: "Usa hasta 1,000 caracteres." } })} {...props("reason")} />{error("reason")}</label></div>
      <p className="draft-notice">Puedes preparar y revisar la cita. El guardado en la agenda aún no está disponible.</p>
      {preview ? <section role="status" className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 clinical-page-content">
        <h3 className="text-sm font-extrabold text-indigo-900">Resumen de la cita · Sin guardar</h3>
        <p className="mt-2 text-sm text-slate-700">{data.patients.find(p => p.id === preview.patientId)?.fullName}</p>
        <p className="mt-1 text-sm text-slate-600">{dateTime(fromZonedTime(preview.date + "T" + preview.time, data.timezone).toISOString(), data.timezone)} · {preview.urgency === "urgent" ? "Prioritaria" : "Rutina"}</p>
        <p className="mt-2 text-sm text-slate-600">{preview.reason}</p>
      </section> : null}
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5"><button className="clinical-button" type="button" onClick={() => { reset(); setPreview(null); }}>Limpiar</button><button className="clinical-button clinical-button-primary" type="submit" disabled={!data.patients.length}>Revisar cita <span aria-hidden="true">→</span></button></div>
    </div>
  </form>;
}
