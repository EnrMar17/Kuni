"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addPatientComplication,
  deactivatePatientComplication,
  markUrgent,
  resolveAlert,
  correctMeasurement,
  correctMedicationResponse,
  adjustPrescription,
  setMedicationTherapeuticClass,
} from "@/actions/clinical";
import { sendManualMessageTestAction } from "@/actions/messaging";
import { MANUAL_SMS_TEST_BODY, MANUAL_WHATSAPP_TEST_BODY } from "@/contracts/messaging";
import type {
  DashboardAlert,
  DashboardComplication,
  DashboardInteraction,
  DashboardMeasurement,
  DashboardPrescription,
} from "@/lib/domain/dashboard";

function ActionMessage({ message }: { message: string | null }) {
  if (!message) return null;
  const isSuccess =
    /^(La alerta se actualizó|Se registró la urgencia clínica|Complicación registrada|Complicación retirada|Medición corregida|Toma de medicamento corregida|Ajuste de receta registrado|Prueba de (SMS|WhatsApp) solicitada|Esta prueba ya estaba solicitada)\.?/i.test(
      message.trim(),
    );
  return (
    <p
      aria-live={isSuccess ? "polite" : "assertive"}
      className={`mt-3 text-sm font-medium ${isSuccess ? "text-emerald-800" : "text-rose-800"}`}
      role={isSuccess ? "status" : "alert"}
    >
      {message}
    </p>
  );
}

function useDismissOnEscape(active: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onDismiss]);
}

export function ManualMessageTestAction({
  patientId,
  phoneE164,
  consentGranted,
  channel,
}: {
  patientId: string;
  phoneE164: string;
  consentGranted: boolean;
  channel: "sms" | "whatsapp";
}) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const closePanel = () => {
    setExpanded(false);
    queueMicrotask(() => triggerRef.current?.focus());
  };
  useDismissOnEscape(expanded, closePanel);

  const sendTest = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await sendManualMessageTestAction({
        patientId,
        requestId: crypto.randomUUID(),
        channel,
      });
      if (result.error) return setMessage(result.error.message);
      setExpanded(false);
      setMessage(
        result.data.status === "accepted"
          ? channel === "sms"
            ? "Prueba de SMS solicitada. Confirma el envío en el iPhone."
            : "Prueba de WhatsApp solicitada. Revisa el teléfono receptor."
          : "Esta prueba ya estaba solicitada.",
      );
    });
  };

  return (
    <div className="mt-5 border-t border-indigo-100 pt-4">
      <p className="text-xs leading-relaxed text-slate-500">
        Los recordatorios se generan automáticamente a su hora. Este control solo adelanta una prueba por {channel === "sms" ? "SMS" : "WhatsApp"}.
      </p>
      <button
        ref={triggerRef}
        aria-controls={panelId}
        aria-expanded={expanded}
        className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={!consentGranted || isPending}
        onClick={() => {
          setExpanded((value) => !value);
          setMessage(null);
        }}
        type="button"
      >
        {isPending ? "Solicitando…" : `Enviar ${channel === "sms" ? "SMS" : "WhatsApp"} de prueba`}
      </button>
      {!consentGranted ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Se necesita consentimiento vigente para habilitar la prueba.
        </p>
      ) : null}
      {expanded ? (
        <div className="clinical-inline-panel mt-3" id={panelId} role="region" aria-label={`Confirmar ${channel === "sms" ? "SMS" : "WhatsApp"} de prueba`}>
          <p className="text-sm font-extrabold text-slate-900">Confirmar envío de prueba</p>
          <p className="mt-2 text-xs text-slate-500">Destino: {phoneE164}</p>
          <p className="mt-3 rounded-xl bg-white p-3 text-sm leading-relaxed text-slate-700">
            {channel === "sms" ? MANUAL_SMS_TEST_BODY : MANUAL_WHATSAPP_TEST_BODY}
          </p>
          {channel === "sms" ? (
            <p className="mt-2 text-xs leading-relaxed text-amber-700">
              SMS8 lo pondrá en cola; iOS todavía puede pedirte elegir el chip y confirmar.
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-amber-700">
              El número receptor debe haberse unido al Sandbox y haber escrito durante las últimas 24 horas.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="clinical-button" disabled={isPending} onClick={sendTest} type="button">
              {isPending ? "Enviando…" : "Sí, enviar prueba"}
            </button>
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
              disabled={isPending}
              onClick={closePanel}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
      <ActionMessage message={message} />
    </div>
  );
}

export function AlertActions({ alert }: { alert: DashboardAlert }) {
  const router = useRouter();
  const panelId = useId();
  const reasonId = useId();
  const reasonErrorId = useId();
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"acknowledged" | "resolved" | "dismissed">(
    "acknowledged",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [showReasonHint, setShowReasonHint] = useState(false);

  const closePanel = () => {
    setExpanded(false);
    setShowReasonHint(false);
    queueMicrotask(() => triggerRef.current?.focus());
  };

  useDismissOnEscape(expanded, closePanel);

  useEffect(() => {
    if (expanded) firstFieldRef.current?.focus();
  }, [expanded]);

  const submitResolution = () => {
    if (!reason.trim()) {
      setShowReasonHint(true);
      return;
    }
    startTransition(async () => {
      const result = await resolveAlert({
        patientId: alert.patientId,
        alertId: alert.id,
        expectedUpdatedAt: alert.updatedAt,
        status,
        note: reason,
      });
      if (result.error) return setMessage(result.error.message);
      setExpanded(false);
      setReason("");
      setShowReasonHint(false);
      setMessage("La alerta se actualizó.");
      router.refresh();
    });
  };

  const submitUrgent = () => {
    if (!reason.trim()) {
      setShowReasonHint(true);
      return;
    }
    startTransition(async () => {
      const result = await markUrgent({
        patientId: alert.patientId,
        eventId: crypto.randomUUID(),
        reason,
      });
      if (result.error) return setMessage(result.error.message);
      setReason("");
      setShowReasonHint(false);
      setMessage("Se registró la urgencia clínica.");
      router.refresh();
    });
  };

  return (
    <div className="w-full sm:w-auto">
      <button
        ref={triggerRef}
        aria-controls={panelId}
        aria-expanded={expanded}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-sky-300 hover:text-sky-700"
        onClick={() => {
          setExpanded((value) => !value);
          setMessage(null);
          setShowReasonHint(false);
        }}
        type="button"
      >
        Atender alerta
      </button>
      {expanded ? (
        <div
          className="clinical-inline-panel mt-3"
          id={panelId}
          role="region"
          aria-label="Atención de alerta"
        >
          <label className="block text-sm font-bold text-slate-700" htmlFor={`${panelId}-status`}>
            Estado
            <select
              ref={firstFieldRef}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              disabled={isPending}
              id={`${panelId}-status`}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              value={status}
            >
              <option value="acknowledged">Reconocida</option>
              <option value="resolved">Resuelta</option>
              <option value="dismissed">Descartada</option>
            </select>
          </label>
          <label className="mt-3 block text-sm font-bold text-slate-700" htmlFor={reasonId}>
            Motivo
            <textarea
              aria-describedby={showReasonHint ? reasonErrorId : undefined}
              aria-invalid={showReasonHint || undefined}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              disabled={isPending}
              id={reasonId}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setShowReasonHint(false);
              }}
              rows={3}
              value={reason}
            />
          </label>
          {showReasonHint ? (
            <span className="field-error" id={reasonErrorId} role="alert">
              Describe el motivo de la atención.
            </span>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="clinical-button clinical-button-primary"
              disabled={isPending}
              onClick={submitResolution}
              type="button"
            >
              {isPending ? "Guardando…" : "Guardar atención"}
            </button>
            <button
              className="clinical-button"
              disabled={isPending}
              onClick={submitUrgent}
              type="button"
            >
              Marcar urgencia
            </button>
            <button
              className="clinical-button"
              disabled={isPending}
              onClick={closePanel}
              type="button"
            >
              Cerrar
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Pulsa Escape para cerrar este panel.
          </p>
        </div>
      ) : null}
      <ActionMessage message={message} />
    </div>
  );
}

const complicationCodes = [
  "E110",
  "E111",
  "E112",
  "E113",
  "E114",
  "E115",
  "E116",
  "E117",
  "E118",
  "E119",
] as const;

export function ComplicationPanel({
  patientId,
  complications,
}: {
  patientId: string;
  complications: DashboardComplication[];
}) {
  const router = useRouter();
  const reasonId = useId();
  const reasonErrorId = useId();
  const panelId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState<(typeof complicationCodes)[number]>("E119");
  const [diagnosedOn, setDiagnosedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [removing, setRemoving] = useState<DashboardComplication | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showReasonHint, setShowReasonHint] = useState(false);

  useDismissOnEscape(Boolean(removing), () => {
    setRemoving(null);
    setShowReasonHint(false);
  });

  useEffect(() => {
    if (removing) reasonRef.current?.focus();
  }, [removing]);

  const add = () =>
    startTransition(async () => {
      const result = await addPatientComplication({
        patientId,
        code,
        diagnosedOn: diagnosedOn || null,
        notes: notes || null,
      });
      if (result.error) return setMessage(result.error.message);
      setNotes("");
      setDiagnosedOn("");
      setMessage("Complicación registrada.");
      router.refresh();
    });

  const remove = () => {
    if (!removing) return;
    if (!reason.trim()) {
      setShowReasonHint(true);
      return;
    }
    startTransition(async () => {
      const result = await deactivatePatientComplication({
        patientId,
        complicationId: removing.id,
        expectedUpdatedAt: removing.updatedAt,
        reason,
      });
      if (result.error) return setMessage(result.error.message);
      setRemoving(null);
      setReason("");
      setShowReasonHint(false);
      setMessage("Complicación retirada.");
      router.refresh();
    });
  };

  return (
    <details className="details-panel clinical-panel">
      <summary>
        <h2 className="text-base font-extrabold text-slate-900">
          Complicaciones de diabetes
        </h2>
        <svg className="details-panel-chevron size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      </summary>
      <div className="details-panel-body">
      <p className="text-sm text-slate-500">
        RF28. E119 significa que se revisó y no hay complicaciones; no puede coexistir
        con otro código vigente.
      </p>
      <ul className="mt-4 space-y-2">
        {complications.map((item) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
            key={item.id}
          >
            <span className="text-sm font-semibold text-slate-800">
              {item.code}
              {item.diagnosedOn ? ` · ${item.diagnosedOn}` : ""}
              {item.notes ? ` · ${item.notes}` : ""}
            </span>
            <button
              className="text-sm font-bold text-rose-800 underline-offset-2 hover:underline"
              disabled={isPending}
              onClick={() => {
                setRemoving(item);
                setMessage(null);
                setShowReasonHint(false);
              }}
              type="button"
            >
              Retirar
            </button>
          </li>
        ))}
        {!complications.length ? (
          <li className="text-sm text-slate-500">
            Sin registro de revisión de complicaciones.
          </li>
        ) : null}
      </ul>
      {removing ? (
        <div
          className="clinical-inline-panel mt-4"
          data-tone="warn"
          id={panelId}
          role="region"
          aria-label={`Retirar complicación ${removing.code}`}
        >
          <label className="block text-sm font-bold text-slate-700" htmlFor={reasonId}>
            Motivo para retirar {removing.code}
            <textarea
              ref={reasonRef}
              aria-describedby={showReasonHint ? reasonErrorId : undefined}
              aria-invalid={showReasonHint || undefined}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              disabled={isPending}
              id={reasonId}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setShowReasonHint(false);
              }}
              rows={2}
              value={reason}
            />
          </label>
          {showReasonHint ? (
            <span className="field-error" id={reasonErrorId} role="alert">
              Describe el motivo del retiro.
            </span>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="clinical-button"
              disabled={isPending}
              onClick={remove}
              type="button"
            >
              Confirmar retiro
            </button>
            <button
              className="text-sm font-semibold text-slate-700 underline-offset-2 hover:underline"
              disabled={isPending}
              onClick={() => {
                setRemoving(null);
                setShowReasonHint(false);
              }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-bold text-slate-700" htmlFor={`${panelId}-code`}>
            Código
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              disabled={isPending}
              id={`${panelId}-code`}
              onChange={(event) => setCode(event.target.value as typeof code)}
              value={code}
            >
              {complicationCodes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700" htmlFor={`${panelId}-date`}>
            Fecha
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              disabled={isPending}
              id={`${panelId}-date`}
              onChange={(event) => setDiagnosedOn(event.target.value)}
              type="date"
              value={diagnosedOn}
            />
          </label>
          <label className="text-sm font-bold text-slate-700" htmlFor={`${panelId}-notes`}>
            Notas
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              disabled={isPending}
              id={`${panelId}-notes`}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </label>
          <button
            className="clinical-button clinical-button-primary justify-self-start"
            disabled={isPending}
            onClick={add}
            type="button"
          >
            {isPending ? "Guardando…" : "Registrar"}
          </button>
        </div>
      )}
      <ActionMessage message={message} />
      </div>
    </details>
  );
}

export function MeasurementCorrection({
  patientId,
  measurement,
}: {
  patientId: string;
  measurement: DashboardMeasurement;
}) {
  const router = useRouter();
  const valueId = useId();
  const reasonId = useId();
  const reasonErrorId = useId();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showReasonHint, setShowReasonHint] = useState(false);
  const [value, setValue] = useState(
    measurement.kind === "glucose"
      ? String(measurement.glucoseMgDl ?? "")
      : `${measurement.systolicMmHg ?? ""}/${measurement.diastolicMmHg ?? ""}`,
  );

  const save = () => {
    if (!reason.trim()) {
      setShowReasonHint(true);
      return;
    }
    startTransition(async () => {
      if (!measurement.updatedAt) {
        return setMessage(
          "Esta lectura no tiene token de concurrencia; actualiza la ficha.",
        );
      }
      const observedAt = measurement.observedAt;
      const input =
        measurement.kind === "glucose"
          ? {
              kind: "glucose" as const,
              patientId,
              measurementId: measurement.id,
              expectedUpdatedAt: measurement.updatedAt,
              observedAt,
              glucoseMgDl: Number(value),
              context: measurement.context as
                | "fasting"
                | "before_meal"
                | "after_meal"
                | "random"
                | "unspecified",
              reason,
            }
          : (() => {
              const [systolicMmHg, diastolicMmHg] = value.split("/").map(Number);
              return {
                kind: "blood_pressure" as const,
                patientId,
                measurementId: measurement.id,
                expectedUpdatedAt: measurement.updatedAt!,
                observedAt,
                systolicMmHg,
                diastolicMmHg,
                reason,
              };
            })();
      const result = await correctMeasurement(input);
      if (result.error) return setMessage(result.error.message);
      setShowReasonHint(false);
      setMessage("Medición corregida.");
      router.refresh();
    });
  };

  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-bold text-sky-800 [&::-webkit-details-marker]:hidden hover:underline">
        Corregir {measurement.kind === "glucose" ? "glucosa" : "presión"}
        <svg className="size-3 text-sky-700 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      </summary>
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
      <label className="block text-xs font-bold text-slate-700" htmlFor={valueId}>
        {measurement.kind === "glucose"
          ? "Nuevo valor (mg/dL)"
          : "Nuevo valor (sistólica/diastólica)"}
        <input
          className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1"
          disabled={isPending}
          id={valueId}
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
      </label>
      <label className="mt-2 block text-xs font-bold text-slate-700" htmlFor={reasonId}>
        Motivo
        <textarea
          aria-describedby={showReasonHint ? reasonErrorId : undefined}
          aria-invalid={showReasonHint || undefined}
          className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1"
          disabled={isPending}
          id={reasonId}
          onChange={(event) => {
            setReason(event.target.value);
            if (event.target.value.trim()) setShowReasonHint(false);
          }}
          rows={2}
          value={reason}
        />
      </label>
      {showReasonHint ? (
        <span className="field-error" id={reasonErrorId} role="alert">
          Describe el motivo de la corrección.
        </span>
      ) : null}
      <button
        className="mt-2 text-sm font-bold text-sky-800 underline-offset-2 hover:underline disabled:no-underline"
        disabled={isPending}
        onClick={save}
        type="button"
      >
        {isPending ? "Guardando…" : "Guardar corrección"}
      </button>
      <ActionMessage message={message} />
    </div>
    </details>
  );
}

/**
 * Corrige una toma de medicamento ya registrada (RF20). Solo se renderiza
 * cuando `interaction.response` viene poblado (ver dashboard.ts): sin una
 * fila de `medication_responses` que la RPC pueda identificar sin ambigüedad
 * (`scheduleId` + `scheduledAt`), no hay nada que corregir todavía.
 */
export function MedicationResponseCorrection({
  patientId,
  interaction,
}: {
  patientId: string;
  interaction: DashboardInteraction & { response: NonNullable<DashboardInteraction["response"]> };
}) {
  const router = useRouter();
  const reasonId = useId();
  const reasonErrorId = useId();
  const [isPending, startTransition] = useTransition();
  const [taken, setTaken] = useState(interaction.medicationTaken ?? false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showReasonHint, setShowReasonHint] = useState(false);

  const save = () => {
    if (!reason.trim()) {
      setShowReasonHint(true);
      return;
    }
    startTransition(async () => {
      const result = await correctMedicationResponse({
        patientId,
        responseId: interaction.response.id,
        expectedUpdatedAt: interaction.response.updatedAt,
        scheduleId: interaction.response.scheduleId,
        scheduledAt: interaction.scheduledAt,
        taken,
        reason,
      });
      if (result.error) return setMessage(result.error.message);
      setShowReasonHint(false);
      setMessage("Toma de medicamento corregida.");
      router.refresh();
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold text-slate-700">¿Se tomó el medicamento?</p>
      <div className="mt-1 flex gap-4">
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input checked={taken} disabled={isPending} name={`taken-${interaction.id}`} onChange={() => setTaken(true)} type="radio" />
          Sí
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input checked={!taken} disabled={isPending} name={`taken-${interaction.id}`} onChange={() => setTaken(false)} type="radio" />
          No
        </label>
      </div>
      <label className="mt-2 block text-xs font-bold text-slate-700" htmlFor={reasonId}>
        Motivo
        <textarea
          aria-describedby={showReasonHint ? reasonErrorId : undefined}
          aria-invalid={showReasonHint || undefined}
          className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1"
          disabled={isPending}
          id={reasonId}
          onChange={(event) => {
            setReason(event.target.value);
            if (event.target.value.trim()) setShowReasonHint(false);
          }}
          rows={2}
          value={reason}
        />
      </label>
      {showReasonHint ? (
        <span className="field-error" id={reasonErrorId} role="alert">
          Describe el motivo de la corrección.
        </span>
      ) : null}
      <button
        className="mt-2 text-sm font-bold text-sky-800 underline-offset-2 hover:underline disabled:no-underline"
        disabled={isPending}
        onClick={save}
        type="button"
      >
        {isPending ? "Guardando…" : "Guardar corrección"}
      </button>
      <ActionMessage message={message} />
    </div>
  );
}

export function PrescriptionAdjustment({
  patientId,
  prescription,
}: {
  patientId: string;
  prescription: DashboardPrescription;
}) {
  const router = useRouter();
  const doseId = useId();
  const instructionsId = useId();
  const reasonId = useId();
  const reasonErrorId = useId();
  const [isPending, startTransition] = useTransition();
  const [doseText, setDoseText] = useState(prescription.doseText);
  const [instructions, setInstructions] = useState(prescription.instructions ?? "");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showReasonHint, setShowReasonHint] = useState(false);

  const save = () => {
    if (!reason.trim() || !doseText.trim() || !instructions.trim()) {
      setShowReasonHint(true);
      return;
    }
    startTransition(async () => {
      const schedules = prescription.schedules.flatMap((schedule) =>
        schedule.weekdays.map((weekday) => ({
          weekday,
          localTime: schedule.localTime.slice(0, 5),
        })),
      );
      const result = await adjustPrescription({
        patientId,
        prescriptionId: prescription.id,
        expectedVersion: prescription.version,
        expectedUpdatedAt: prescription.updatedAt,
        medicationId: prescription.medicationId,
        doseText,
        instructions,
        endsAt: prescription.endDate,
        schedules,
        reason,
      });
      if (result.error) return setMessage(result.error.message);
      setShowReasonHint(false);
      setMessage("Ajuste de receta registrado.");
      router.refresh();
    });
  };

  return (
    <div className="mt-3 border-t border-sky-100 pt-3">
      <label className="block text-xs font-bold text-slate-700" htmlFor={doseId}>
        Dosis
        <input
          className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1"
          disabled={isPending}
          id={doseId}
          onChange={(event) => setDoseText(event.target.value)}
          value={doseText}
        />
      </label>
      <label className="mt-2 block text-xs font-bold text-slate-700" htmlFor={instructionsId}>
        Indicaciones
        <textarea
          className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1"
          disabled={isPending}
          id={instructionsId}
          onChange={(event) => setInstructions(event.target.value)}
          rows={2}
          value={instructions}
        />
      </label>
      <label className="mt-2 block text-xs font-bold text-slate-700" htmlFor={reasonId}>
        Motivo del ajuste
        <textarea
          aria-describedby={showReasonHint ? reasonErrorId : undefined}
          aria-invalid={showReasonHint || undefined}
          className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1"
          disabled={isPending}
          id={reasonId}
          onChange={(event) => {
            setReason(event.target.value);
            if (event.target.value.trim()) setShowReasonHint(false);
          }}
          rows={2}
          value={reason}
        />
      </label>
      {showReasonHint ? (
        <span className="field-error" id={reasonErrorId} role="alert">
          Completa dosis, indicaciones y motivo del ajuste.
        </span>
      ) : null}
      <button
        className="mt-2 text-sm font-bold text-sky-800 underline-offset-2 hover:underline disabled:no-underline"
        disabled={isPending}
        onClick={save}
        type="button"
      >
        {isPending ? "Guardando…" : "Ajustar receta"}
      </button>
      <ActionMessage message={message} />
    </div>
  );
}

const therapeuticClasses = [
  {
    value: "antidiabetic",
    label: "Antidiabético",
    description: "Medicamentos para el control de glucosa.",
  },
  {
    value: "antihypertensive",
    label: "Antihipertensivo",
    description: "Medicamentos para el control de presión arterial.",
  },
  {
    value: "other",
    label: "Otra clase",
    description: "No se usa para esas dos cohortes de adherencia.",
  },
] as const;

type TherapeuticClass = (typeof therapeuticClasses)[number]["value"];

// Sugerencia por nombre — NUNCA se guarda sola; solo precarga el <select>
// para que el médico la confirme o la cambie antes de guardar (spec "Perfil
// del paciente" sección 5: "categoría automática, inferida del nombre").
// Lista corta y a propósito conservadora: ante duda, no sugiere nada.
const antidiabeticKeywords = /metformina|glibenclamida|glimepirida|sitagliptina|linagliptina|insulina|empagliflozina|dapagliflozina|pioglitazona/i;
const antihypertensiveKeywords = /losartán|losartan|enalapril|captopril|amlodipino|hidroclorotiazida|telmisartán|telmisartan|valsartán|valsartan|nifedipino|metoprolol|carvedilol/i;
function suggestTherapeuticClass(medicationName: string): TherapeuticClass | "" {
  if (antidiabeticKeywords.test(medicationName)) return "antidiabetic";
  if (antihypertensiveKeywords.test(medicationName)) return "antihypertensive";
  return "";
}

export function MedicationClassification({
  patientId,
  prescription,
}: {
  patientId: string;
  prescription: DashboardPrescription;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const suggestion = prescription.therapeuticClass ? "" : suggestTherapeuticClass(prescription.medicationName);
  const [therapeuticClass, setTherapeuticClass] = useState<TherapeuticClass | "">(
    prescription.therapeuticClass ?? suggestion,
  );
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    if (!therapeuticClass) return;
    startTransition(async () => {
      const result = await setMedicationTherapeuticClass({
        patientId,
        prescriptionId: prescription.id,
        medicationId: prescription.medicationId,
        therapeuticClass,
      });
      if (result.error) return setMessage(result.error.message);
      setMessage("Clasificación guardada y registrada en la auditoría.");
      router.refresh();
    });
  };

  return (
    <section
      aria-labelledby={`medication-class-${prescription.id}`}
      className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-3 transition duration-200 motion-safe:hover:border-sky-200"
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-sky-700 text-xs font-black text-white"
        >
          ✓
        </span>
        <div>
          <h3
            id={`medication-class-${prescription.id}`}
            className="text-sm font-extrabold text-slate-900"
          >
            Clase terapéutica
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            Permite separar la adherencia del modelo sin modificar la receta.
          </p>
        </div>
      </div>
      <label
        className="mt-3 block text-xs font-bold text-slate-700"
        htmlFor={`therapeutic-class-${prescription.id}`}
      >
        Clasificar {prescription.medicationName}
      </label>
      <select
        className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
        disabled={isPending}
        id={`therapeutic-class-${prescription.id}`}
        onChange={(event) => {
          setTherapeuticClass(event.target.value as TherapeuticClass | "");
          setMessage(null);
        }}
        value={therapeuticClass}
      >
        <option value="">Selecciona una clase</option>
        {therapeuticClasses.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {suggestion && therapeuticClass === suggestion ? (
        <p className="mt-1.5 text-[11px] font-medium italic text-slate-500">
          Sugerido automáticamente por el nombre del medicamento — no es una clasificación validada, confírmala antes de guardar.
        </p>
      ) : null}
      {therapeuticClass ? (
        <p className="mt-2 text-xs text-sky-900">
          {
            therapeuticClasses.find((item) => item.value === therapeuticClass)
              ?.description
          }
        </p>
      ) : null}
      {prescription.therapeuticClass ? (
        <p className="mt-2 text-xs font-semibold text-emerald-800">
          Clasificación vigente:{" "}
          {
            therapeuticClasses.find(
              (item) => item.value === prescription.therapeuticClass,
            )?.label
          }
        </p>
      ) : null}
      <button
        className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-sky-800 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending || !therapeuticClass}
        onClick={save}
        type="button"
      >
        {isPending
          ? "Guardando clasificación…"
          : prescription.therapeuticClass
            ? "Actualizar clasificación"
            : "Guardar clasificación"}
      </button>
      {message ? (
        <p
          aria-live="polite"
          className={`mt-3 text-xs font-semibold ${message.includes("guardada") ? "text-emerald-800" : "text-rose-800"}`}
          role={message.includes("guardada") ? "status" : "alert"}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
