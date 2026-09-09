"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DashboardData } from "@/lib/domain/dashboard";
import { dateTime } from "@/components/dashboard/presentation";
import { scheduleAppointment } from "@/actions/appointments";
import { Icon } from "@/components/appointments/icons";
import { PatientPicker } from "@/components/appointments/patient-picker";
import { KuniDayPicker } from "@/components/appointments/kuni-day-picker";
import { ConfirmModal } from "@/components/appointments/confirm-modal";
import { TIME_SLOTS, calendarYmd, friendlyTimezone } from "@/components/appointments/shared";

type AppointmentDraft = {
  patientId: string;
  urgency: "routine" | "urgent";
  reason: string;
};

const REASON_SUGGESTIONS = ["Control glucémico", "Revisión de presión arterial", "Ajuste de dosis", "Valoración de complicaciones"];

export type AppointmentSlotPrefill = { date: Date; time: string; nonce: number };

function validStart(date: Date | undefined, time: string, timezone: string) {
  if (!date || !time) return false;
  const local = calendarYmd(date) + "T" + time;
  const instant = fromZonedTime(local, timezone);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.getTime() > Date.now() &&
    formatInTimeZone(instant, timezone, "yyyy-MM-dd'T'HH:mm") === local
  );
}

export function AppointmentForm({ data, prefill }: { data: DashboardData; prefill?: AppointmentSlotPrefill | null }) {
  const router = useRouter();
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [dateTimeTouched, setDateTimeTouched] = useState(false);
  const [preview, setPreview] = useState<AppointmentDraft | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors },
  } = useForm<AppointmentDraft>({
    mode: "onTouched",
    defaultValues: { patientId: "", urgency: "routine", reason: "" },
  });
  const patientId = watch("patientId");
  const reasonLength = watch("reason")?.length ?? 0;

  const todayLocal = useMemo(() => {
    const [year, month, day] = formatInTimeZone(new Date(), data.timezone, "yyyy-MM-dd").split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [data.timezone]);

  const dateTimeValid = validStart(selectedDate, selectedTime, data.timezone);
  const dateTimeError = dateTimeTouched && !dateTimeValid ? "Elige una fecha y hora futuras válidas." : null;

  const recentPatients = useMemo(
    () =>
      [...data.patients]
        .filter((p) => p.lastResponseAt)
        .sort((a, b) => Date.parse(b.lastResponseAt as string) - Date.parse(a.lastResponseAt as string))
        .slice(0, 4),
    [data.patients],
  );

  const dateTimeSummary =
    selectedDate && selectedTime
      ? new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" }).format(selectedDate) + " · " + selectedTime
      : null;

  // Un horario libre elegido en el calendario grande ("+ Agendar") llega
  // aquí vía `prefill`; `nonce` cambia en cada click para que un mismo
  // día+hora vuelto a elegir dispare el efecto otra vez.
  useEffect(() => {
    if (!prefill) return;
    setSelectedDate(prefill.date);
    setSelectedTime(prefill.time);
    setDateTimeTouched(true);
    formRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un prefill nuevo (nonce), no a cada render
  }, [prefill?.nonce]);

  useEffect(() => {
    register("patientId", {
      required: "Selecciona un paciente.",
      validate: (value) => data.patients.some((p) => p.id === value) || "Selecciona un paciente de este consultorio.",
    });
    register("reason", {
      validate: (value) => value.trim().length >= 3 || "Describe el motivo de la cita.",
      maxLength: { value: 1000, message: "Usa hasta 1,000 caracteres." },
    });
  }, [data.patients, register]);

  async function confirmSave() {
    if (!preview || !selectedDate || !selectedTime || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const localStart = calendarYmd(selectedDate) + "T" + selectedTime;
      const startsAt = fromZonedTime(localStart, data.timezone).toISOString();
      const result = await scheduleAppointment({
        patientId: preview.patientId,
        startsAt,
        urgency: preview.urgency,
        reason: preview.reason,
      });
      if (result.error) {
        setSaveError(
          result.error.code === "CONFLICT"
            ? "Ese consultorio ya tiene una cita agendada en ese horario. Elige otro horario."
            : result.error.message,
        );
        return;
      }
      reset();
      setSelectedDate(undefined);
      setSelectedTime("");
      setDateTimeTouched(false);
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

  const selectedPatient = data.patients.find((p) => p.id === preview?.patientId);

  return (
    <>
      <form
        className="clinical-panel relative flex h-full flex-col overflow-hidden"
        noValidate
        onChangeCapture={() => setSaveError(null)}
        ref={formRef}
        onSubmit={handleSubmit(async (draft) => {
          setDateTimeTouched(true);
          const valid = await trigger();
          if (!valid || !dateTimeValid) return;
          setSaved(false);
          setPreview(draft);
        })}
      >
        <div className="relative overflow-hidden border-b border-sky-100 bg-sky-100 px-6 py-5">
          <span aria-hidden="true" className="absolute -right-8 -top-12 size-32 rounded-full bg-sky-200/30" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#001d39] text-white shadow-md motion-safe:animate-[kuni-pulse-ring_2.4s_ease-in-out_infinite]">
              <Icon className="size-5" name="sparkles" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Nueva cita</h2>
              <p className="text-xs font-medium text-slate-500">Paciente, horario y motivo de seguimiento.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div>
            <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700" htmlFor="cita-paciente">
              <Icon className="size-4 text-slate-400" name="user" />
              Paciente
            </label>
            <PatientPicker
              describedBy={errors.patientId ? "patientId-error" : undefined}
              inputId="cita-paciente"
              invalid={Boolean(errors.patientId)}
              onBlurField={() => trigger("patientId")}
              onChange={(id) => {
                setValue("patientId", id, { shouldValidate: true });
              }}
              patients={data.patients}
              value={patientId}
            />
            {errors.patientId ? (
              <span className="field-error" id="patientId-error" role="alert">
                {errors.patientId.message}
              </span>
            ) : null}
            {recentPatients.length ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recientes:</span>
                {recentPatients.map((p) => (
                  <button
                    className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-sky-100 hover:text-[#0a4470]"
                    key={p.id}
                    onClick={() => setValue("patientId", p.id, { shouldValidate: true })}
                    type="button"
                  >
                    {p.fullName.split(" ").slice(0, 2).join(" ")}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                <Icon className="size-4 text-slate-400" name="calendar" />
                Fecha y hora
              </span>
              {dateTimeSummary ? (
                <span className="font-mono-data inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold capitalize text-emerald-700">
                  <Icon className="size-3.5" name="check" />
                  {dateTimeSummary}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1 text-[11px] font-bold text-[#1c7fb0]">
                  <Icon className="size-3.5" name="clock" />
                  {friendlyTimezone(data.timezone)}
                </span>
              )}
            </div>
            <div className="grid gap-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-2.5 sm:grid-cols-12">
              <div className="rounded-xl border border-slate-200/70 bg-white p-2.5 sm:col-span-7">
                <KuniDayPicker
                  className="kuni-calendar--compact mx-auto"
                  disabledBefore={todayLocal}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setDateTimeTouched(true);
                  }}
                  selected={selectedDate}
                  today={todayLocal}
                />
              </div>
              <div className="flex min-w-0 flex-col sm:col-span-5">
                <p className="mb-1.5 px-0.5 text-[11px] font-bold text-slate-500">
                  {selectedDate
                    ? new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(selectedDate)
                    : "Elige primero una fecha"}
                </p>
                <div className="time-slot-grid" role="listbox" aria-label="Horas disponibles">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      aria-selected={selectedTime === slot}
                      className="time-slot-chip"
                      disabled={!selectedDate}
                      key={slot}
                      onClick={() => {
                        setSelectedTime(slot);
                        setDateTimeTouched(true);
                      }}
                      role="option"
                      type="button"
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {dateTimeError ? (
              <span className="field-error" role="alert">
                {dateTimeError}
              </span>
            ) : null}
          </div>

          <fieldset disabled={isSaving}>
            <legend className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <Icon className="size-4 text-slate-400" name="stethoscope" />
              Tipo de cita
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="diagnosis-option cursor-pointer">
                <input type="radio" value="routine" {...register("urgency")} />
                <span>
                  <strong className="block">Rutina</strong>
                  <span className="field-hint">Control y seguimiento</span>
                </span>
              </label>
              <label className="diagnosis-option cursor-pointer">
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
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Icon className="size-4 text-slate-400" name="note" />
                  Motivo de la cita
                </span>
                <span className="text-[11px] font-medium text-slate-400">{reasonLength}/1000</span>
              </span>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sugerencias:</span>
                {REASON_SUGGESTIONS.map((suggestion) => (
                  <button
                    className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-sky-100 hover:text-[#0a4470]"
                    key={suggestion}
                    onClick={() => setValue("reason", suggestion, { shouldValidate: true })}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                placeholder="Por ejemplo: revisión del tratamiento y registros de presión."
                {...register("reason")}
                aria-invalid={Boolean(errors.reason) || undefined}
                aria-describedby={errors.reason ? "reason-error" : undefined}
              />
              {errors.reason ? (
                <span className="field-error" id="reason-error" role="alert">
                  {errors.reason.message}
                </span>
              ) : null}
            </label>
          </div>

          {saved ? (
            <p
              className="motion-safe:animate-[kuni-rise_280ms_ease-out_both] flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
              role="status"
            >
              <Icon className="size-4" name="check" />
              Cita guardada en la agenda.
            </p>
          ) : null}

          <div className="mt-auto flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
            <button
              className="clinical-button"
              type="button"
              onClick={() => {
                reset();
                setSelectedDate(undefined);
                setSelectedTime("");
                setDateTimeTouched(false);
                setPreview(null);
                setSaveError(null);
                setSaved(false);
              }}
            >
              Limpiar
            </button>
            <button className="clinical-button clinical-button-primary" disabled={!data.patients.length || isSaving} type="submit">
              Revisar cita <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </form>

      <ConfirmModal
        confirmLabel="Confirmar y guardar"
        error={saveError}
        eyebrow="Resumen de la cita · sin guardar"
        isConfirming={isSaving}
        onClose={() => {
          if (!isSaving) setPreview(null);
        }}
        onConfirm={confirmSave}
        open={Boolean(preview)}
        title="¿Confirmas esta cita?"
      >
        {preview && selectedDate && selectedTime ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-sm font-extrabold text-sky-800 shadow-sm">
                {selectedPatient?.fullName
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("") ?? "—"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900">{selectedPatient?.fullName}</p>
                <p className="font-mono-data truncate text-xs text-slate-500">{selectedPatient?.clinicalRecord}</p>
              </div>
            </div>
            <dl className="grid gap-2.5 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <Icon className="size-4 shrink-0 text-sky-600" name="clock" />
                <dd>
                  {dateTime(fromZonedTime(calendarYmd(selectedDate) + "T" + selectedTime, data.timezone).toISOString(), data.timezone)}
                </dd>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Icon className="size-4 shrink-0 text-sky-600" name="stethoscope" />
                <dd>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${preview.urgency === "urgent" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}
                  >
                    {preview.urgency === "urgent" ? "Prioritaria" : "Rutina"}
                  </span>
                </dd>
              </div>
              <div className="flex items-start gap-2 text-slate-700">
                <Icon className="mt-0.5 size-4 shrink-0 text-sky-600" name="note" />
                <dd className="leading-relaxed">{preview.reason}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </ConfirmModal>
    </>
  );
}
