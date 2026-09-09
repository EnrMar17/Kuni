"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DashboardData } from "@/lib/domain/dashboard";
import { dateTime } from "@/components/dashboard/presentation";
import { scheduleAppointment } from "@/actions/appointments";

type AppointmentDraft = {
  patientId: string;
  date: string;
  time: string;
  urgency: "routine" | "urgent";
  reason: string;
};

function validStart(date: string, time: string, timezone: string) {
  const local = date + "T" + time;
  const instant = fromZonedTime(local, timezone);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.getTime() > Date.now() &&
    formatInTimeZone(instant, timezone, "yyyy-MM-dd'T'HH:mm") === local
  );
}

export function AppointmentForm({ data }: { data: DashboardData }) {
  const router = useRouter();
  const savingRef = useRef(false);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);
  const [preview, setPreview] = useState<AppointmentDraft | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<AppointmentDraft>({
    mode: "onTouched",
    defaultValues: {
      patientId: "",
      date: "",
      time: "",
      urgency: "routine",
      reason: "",
    },
  });
  const props = (name: keyof AppointmentDraft) => ({
    "aria-invalid": Boolean(errors[name]) || undefined,
    "aria-describedby": errors[name] ? name + "-error" : undefined,
  });
  const error = (name: keyof AppointmentDraft) =>
    errors[name] ? (
      <span role="alert" id={name + "-error"} className="field-error">
        {errors[name]?.message}
      </span>
    ) : null;

  useEffect(() => {
    if (!saveError) return;
    saveErrorRef.current?.focus();
  }, [saveError]);

  async function confirmSave() {
    if (!preview || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const startsAt = fromZonedTime(preview.date + "T" + preview.time, data.timezone).toISOString();
      const result = await scheduleAppointment({
        patientId: preview.patientId,
        startsAt,
        urgency: preview.urgency,
        reason: preview.reason,
      });
      if (result.error) {
        setSaveError(result.error.code === "CONFLICT"
          ? "Ese consultorio ya tiene una cita agendada en ese horario. Elige otro horario."
          : result.error.message);
        return;
      }
      reset();
      setPreview(null);
      setSaved(true);
      router.refresh();
    } catch {
      setSaveError("No se pudo confirmar el guardado. Revisa la conexión antes de reintentar.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      className="clinical-panel overflow-hidden self-start"
      noValidate
      onChangeCapture={() => {
        setPreview(null);
        setSaveError(null);
      }}
      onSubmit={handleSubmit((draft) => {
        setSaved(false);
        setPreview(draft);
      })}
    >
      <div className="border-b border-sky-100 bg-gradient-to-br from-sky-100 via-sky-50 to-white p-6">
        <div className="mb-3 flex items-center gap-3">
          <span aria-hidden="true" className="section-number">
            01
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-[#1c7fb0]">
            Agenda clínica
          </span>
        </div>
        <h2 className="text-xl font-extrabold text-slate-900">
          Programar cita
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Elige al paciente, define el horario y agrega el motivo de
          seguimiento.
        </p>
      </div>
      <div className="grid gap-6 p-6">
        <div className="form-fields !grid-cols-1">
          <label>
            Paciente
            <select
              {...register("patientId", {
                required: "Selecciona un paciente.",
                validate: (value) =>
                  data.patients.some((p) => p.id === value) ||
                  "Selecciona un paciente de este consultorio.",
              })}
              {...props("patientId")}
            >
              <option value="">Selecciona un paciente</option>
              {data.patients.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.fullName} · {p.clinicalRecord}
                </option>
              ))}
            </select>
            {error("patientId")}
          </label>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold text-slate-500">
            Horario del consultorio · {data.timezone}
          </p>
          <div className="form-fields">
            <label>
              Fecha
              <input
                type="date"
                {...register("date", { required: "Selecciona una fecha." })}
                {...props("date")}
              />
              {error("date")}
            </label>
            <label>
              Hora
              <input
                type="time"
                {...register("time", {
                  required: "Selecciona una hora.",
                  validate: (value) =>
                    validStart(getValues("date"), value, data.timezone) ||
                    "Elige una fecha y hora futuras válidas.",
                })}
                {...props("time")}
              />
              {error("time")}
            </label>
          </div>
        </div>
        <fieldset disabled={isSaving}>
          <legend className="mb-3 text-sm font-bold text-slate-700">
            Tipo de cita
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="diagnosis-option">
              <input type="radio" value="routine" {...register("urgency")} />
              <span>
                <strong className="block">Rutina</strong>
                <span className="field-hint">Control y seguimiento</span>
              </span>
            </label>
            <label className="diagnosis-option">
              <input type="radio" value="urgent" {...register("urgency")} />
              <span>
                <strong className="block">Prioritaria</strong>
                <span className="field-hint">Valoración preferente</span>
              </span>
            </label>
          </div>
        </fieldset>
        <div className="form-fields !grid-cols-1">
          <label>
            Motivo de la cita
            <textarea
              rows={3}
              placeholder="Por ejemplo: revisión del tratamiento y registros de presión."
              {...register("reason", {
                validate: (value) =>
                  value.trim().length >= 3 || "Describe el motivo de la cita.",
                maxLength: {
                  value: 1000,
                  message: "Usa hasta 1,000 caracteres.",
                },
              })}
              {...props("reason")}
            />
            {error("reason")}
          </label>
        </div>
        {preview ? (
          <section
            role="status"
            className="rounded-2xl border border-sky-200 bg-sky-50 p-4 clinical-page-content"
          >
            <h3 className="text-sm font-extrabold text-[#0a4470]">
              Resumen de la cita · Sin guardar
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              {data.patients.find((p) => p.id === preview.patientId)?.fullName}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {dateTime(
                fromZonedTime(
                  preview.date + "T" + preview.time,
                  data.timezone,
                ).toISOString(),
                data.timezone,
              )}{" "}
              · {preview.urgency === "urgent" ? "Prioritaria" : "Rutina"}
            </p>
            <p className="mt-2 text-sm text-slate-600">{preview.reason}</p>
            <div className="mt-4 flex justify-end">
              <button
                className="clinical-button clinical-button-primary"
                type="button"
                disabled={isSaving}
                onClick={confirmSave}
              >
                {isSaving ? "Guardando…" : "Confirmar y guardar"}
              </button>
            </div>
          </section>
        ) : null}
        {saved ? (
          <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Cita guardada en la agenda.
          </p>
        ) : null}
        {saveError ? (
          <p
            ref={saveErrorRef}
            role="alert"
            tabIndex={-1}
            className="field-error rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 outline-none"
          >
            {saveError}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            className="clinical-button"
            type="button"
            onClick={() => {
              reset();
              setPreview(null);
              setSaveError(null);
              setSaved(false);
            }}
          >
            Limpiar
          </button>
          <button
            className="clinical-button clinical-button-primary"
            type="submit"
            disabled={!data.patients.length || isSaving}
          >
            Revisar cita <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </form>
  );
}
