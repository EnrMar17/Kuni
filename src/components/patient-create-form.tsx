"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { savePatient } from "@/actions/patients";
import { dashboardQueryKey } from "@/lib/queries/dashboard-keys";
import { savePatientSchema, type PatientEditData } from "@/contracts/patient-registration";
import type { InitialCare, MedicationOption } from "@/contracts/clinical";
import "./patient-create-form.css";

type ScheduleRow = { weekday: string; localTime: string };

type PatientDraft = {
  fullName: string;
  birthDate: string;
  sex: string;
  clinicalRecord: string;
  curp: string;
  whatsappE164: string;
  bloodType: string;
  diagnoses: string[];
  // Fecha de diagnóstico por código ("" = sin capturar). Solo se envían las
  // llaves de `diagnoses` que sigan marcadas al guardar.
  diagnosedOn: Record<string, string>;
  // "" (sin capturar) se traduce a null al enviar; nunca a un valor por
  // defecto — la fase queda 100% a criterio médico (spec sección 3).
  diabetesTreatmentPhase: string;
  hypertensionTreatmentPhase: string;
  initialRisk: string;
  initialRiskReason: string;
  consentGranted: boolean;
  noticeVersion: string;
  consentMethod: string;
  evidenceNote: string;
  reason: string;
  // U08 fase 2 — alta únicamente; "sin capturar" en el picker/inputs queda
  // como "" y se traduce a null al enviar, nunca a un valor por defecto.
  prescriptionEnabled: boolean;
  prescriptionMedicationId: string;
  prescriptionDoseText: string;
  prescriptionInstructions: string;
  prescriptionEndsAt: string;
  prescriptionSchedules: ScheduleRow[];
  // Glucosa en ayuno y postprandial son dos planes independientes (spec
  // sección 6) — la postprandial siempre usa measurementContext="after_meal",
  // sin selector propio.
  glucoseFastingPlanEnabled: boolean;
  glucoseFastingLocalTime: string;
  glucoseFastingWeekdays: string[];
  glucoseFastingContext: string;
  glucoseFastingMin: string;
  glucoseFastingMax: string;
  glucoseFastingCriticalMin: string;
  glucoseFastingCriticalMax: string;
  glucosePostprandialPlanEnabled: boolean;
  glucosePostprandialLocalTime: string;
  glucosePostprandialWeekdays: string[];
  glucosePostprandialMin: string;
  glucosePostprandialMax: string;
  glucosePostprandialCriticalMin: string;
  glucosePostprandialCriticalMax: string;
  bpPlanEnabled: boolean;
  bpLocalTime: string;
  bpWeekdays: string[];
  systolicMin: string;
  systolicMax: string;
  diastolicMin: string;
  diastolicMax: string;
  systolicCriticalMin: string;
  systolicCriticalMax: string;
  diastolicCriticalMin: string;
  diastolicCriticalMax: string;
};

const weekdayLabels = [["1", "Lun"], ["2", "Mar"], ["3", "Mié"], ["4", "Jue"], ["5", "Vie"], ["6", "Sáb"], ["7", "Dom"]] as const;

/** "" (sin capturar) -> null; un número tal cual. Nunca inventa un cero. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

const diagnoses = [
  ["diabetes_type_1", "Diabetes tipo 1"],
  ["diabetes_type_2", "Diabetes tipo 2"],
  ["diabetes_gestational", "Diabetes gestacional"],
  ["diabetes_other", "Otra diabetes"],
  ["hypertension", "Hipertensión"],
  ["other", "Otro diagnóstico"],
] as const;

const diabetesDiagnosisCodes = ["diabetes_type_1", "diabetes_type_2", "diabetes_gestational", "diabetes_other"];

const diabetesTreatmentPhases = [
  ["estable_oral", "Estable con tratamiento oral"],
  ["ajuste_insulina", "En ajuste de insulina"],
  ["insulina_estable_hba1c", "Insulina estable, HbA1c controlada"],
] as const;

const hypertensionTreatmentPhases = [
  ["controlada", "Controlada"],
  ["en_ajuste", "En ajuste"],
] as const;

// React Hook Form invokes this validator on blur/submission, not during render.
function validateBirthDate(value: string) {
  return (
    (Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now()) ||
    "La fecha debe ser válida y no estar en el futuro."
  );
}

export function PatientCreateForm({ initial, medications = [] }: { initial?: PatientEditData; medications?: MedicationOption[]; doctorName: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const patientId = useRef(initial?.patientId);
  const saving = useRef(false);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<PatientDraft>({
    mode: "onTouched",
    defaultValues: {
      sex: "unknown",
      initialRisk: "unknown",
      bloodType: "",
      diagnoses: [],
      diagnosedOn: {},
      diabetesTreatmentPhase: "",
      hypertensionTreatmentPhase: "",
      consentGranted: false,
      consentMethod: "in_person",
      prescriptionEnabled: false, prescriptionMedicationId: "", prescriptionDoseText: "", prescriptionInstructions: "",
      prescriptionEndsAt: "", prescriptionSchedules: [{ weekday: "1", localTime: "08:00" }],
      glucoseFastingPlanEnabled: false, glucoseFastingLocalTime: "07:00", glucoseFastingWeekdays: [], glucoseFastingContext: "fasting",
      glucoseFastingMin: "", glucoseFastingMax: "", glucoseFastingCriticalMin: "", glucoseFastingCriticalMax: "",
      glucosePostprandialPlanEnabled: false, glucosePostprandialLocalTime: "13:00", glucosePostprandialWeekdays: [],
      glucosePostprandialMin: "", glucosePostprandialMax: "", glucosePostprandialCriticalMin: "", glucosePostprandialCriticalMax: "",
      bpPlanEnabled: false, bpLocalTime: "09:00", bpWeekdays: [],
      systolicMin: "", systolicMax: "", diastolicMin: "", diastolicMax: "",
      systolicCriticalMin: "", systolicCriticalMax: "", diastolicCriticalMin: "", diastolicCriticalMax: "",
      ...(initial ? { ...initial.input, curp: initial.input.curp ?? "", bloodType: initial.input.bloodType ?? "",
        diabetesTreatmentPhase: initial.input.diabetesTreatmentPhase ?? "",
        hypertensionTreatmentPhase: initial.input.hypertensionTreatmentPhase ?? "",
        consentGranted: initial.consentGranted } : {}),
    },
  });
  const consent = useWatch({ control, name: "consentGranted" });
  const consentChanged = initial ? consent !== initial.consentGranted : consent;
  const prescriptionEnabled = useWatch({ control, name: "prescriptionEnabled" });
  const glucoseFastingPlanEnabled = useWatch({ control, name: "glucoseFastingPlanEnabled" });
  const glucosePostprandialPlanEnabled = useWatch({ control, name: "glucosePostprandialPlanEnabled" });
  const bpPlanEnabled = useWatch({ control, name: "bpPlanEnabled" });
  const watchedDiagnoses = useWatch({ control, name: "diagnoses" });
  const hasDiabetesDiagnosis = watchedDiagnoses?.some((code) => diabetesDiagnosisCodes.includes(code)) ?? false;
  const hasHypertensionDiagnosis = watchedDiagnoses?.includes("hypertension") ?? false;
  const isComorbid = hasDiabetesDiagnosis && hasHypertensionDiagnosis;
  const { fields: scheduleFields, append: appendSchedule, remove: removeSchedule } = useFieldArray({ control, name: "prescriptionSchedules" });
  const medicationFieldId = useId();

  useEffect(() => {
    if (!saveError) return;
    saveErrorRef.current?.focus();
  }, [saveError]);

  function buildInitialCare(draft: PatientDraft): InitialCare | null {
    if (initial || (!draft.prescriptionEnabled && !draft.glucoseFastingPlanEnabled
      && !draft.glucosePostprandialPlanEnabled && !draft.bpPlanEnabled)) return null;
    const plans: InitialCare["plans"] = [];
    if (draft.glucoseFastingPlanEnabled) {
      plans.push({ kind: "glucose", localTime: draft.glucoseFastingLocalTime, weekdays: draft.glucoseFastingWeekdays.map(Number),
        measurementContext: (draft.glucoseFastingContext || null) as InitialCare["plans"][number]["measurementContext"],
        glucoseMinMgDl: numberOrNull(draft.glucoseFastingMin), glucoseMaxMgDl: numberOrNull(draft.glucoseFastingMax),
        criticalGlucoseMinMgDl: numberOrNull(draft.glucoseFastingCriticalMin), criticalGlucoseMaxMgDl: numberOrNull(draft.glucoseFastingCriticalMax),
        systolicMinMmHg: null, systolicMaxMmHg: null, diastolicMinMmHg: null, diastolicMaxMmHg: null,
        criticalSystolicMinMmHg: null, criticalSystolicMaxMmHg: null, criticalDiastolicMinMmHg: null, criticalDiastolicMaxMmHg: null });
    }
    if (draft.glucosePostprandialPlanEnabled) {
      plans.push({ kind: "glucose", localTime: draft.glucosePostprandialLocalTime, weekdays: draft.glucosePostprandialWeekdays.map(Number),
        measurementContext: "after_meal",
        glucoseMinMgDl: numberOrNull(draft.glucosePostprandialMin), glucoseMaxMgDl: numberOrNull(draft.glucosePostprandialMax),
        criticalGlucoseMinMgDl: numberOrNull(draft.glucosePostprandialCriticalMin), criticalGlucoseMaxMgDl: numberOrNull(draft.glucosePostprandialCriticalMax),
        systolicMinMmHg: null, systolicMaxMmHg: null, diastolicMinMmHg: null, diastolicMaxMmHg: null,
        criticalSystolicMinMmHg: null, criticalSystolicMaxMmHg: null, criticalDiastolicMinMmHg: null, criticalDiastolicMaxMmHg: null });
    }
    if (draft.bpPlanEnabled) {
      plans.push({ kind: "blood_pressure", localTime: draft.bpLocalTime, weekdays: draft.bpWeekdays.map(Number),
        measurementContext: null, glucoseMinMgDl: null, glucoseMaxMgDl: null, criticalGlucoseMinMgDl: null, criticalGlucoseMaxMgDl: null,
        systolicMinMmHg: numberOrNull(draft.systolicMin), systolicMaxMmHg: numberOrNull(draft.systolicMax),
        diastolicMinMmHg: numberOrNull(draft.diastolicMin), diastolicMaxMmHg: numberOrNull(draft.diastolicMax),
        criticalSystolicMinMmHg: numberOrNull(draft.systolicCriticalMin), criticalSystolicMaxMmHg: numberOrNull(draft.systolicCriticalMax),
        criticalDiastolicMinMmHg: numberOrNull(draft.diastolicCriticalMin), criticalDiastolicMaxMmHg: numberOrNull(draft.diastolicCriticalMax) });
    }
    return {
      prescription: draft.prescriptionEnabled ? {
        medicationId: draft.prescriptionMedicationId, doseText: draft.prescriptionDoseText,
        instructions: draft.prescriptionInstructions, endsAt: draft.prescriptionEndsAt || null,
        schedules: draft.prescriptionSchedules.map(row => ({ weekday: Number(row.weekday), localTime: row.localTime })),
      } : null,
      plans,
    };
  }

  async function submit(draft: PatientDraft) {
    if (saving.current) return;
    setSaveError(null);
    patientId.current ??= crypto.randomUUID();
    const diagnosedOn = Object.fromEntries(
      Object.entries(draft.diagnosedOn).filter(([code, value]) => draft.diagnoses.includes(code) && value),
    );
    const parsed = savePatientSchema.safeParse({ patientId: patientId.current, revision: initial?.revision ?? null,
      reason: initial ? draft.reason : "Alta de paciente", initialCare: buildInitialCare(draft), input: {
        fullName: draft.fullName, birthDate: draft.birthDate, sex: draft.sex, clinicalRecord: draft.clinicalRecord,
        curp: draft.curp?.trim().toUpperCase() || null, whatsappE164: draft.whatsappE164,
        bloodType: draft.bloodType || null, diagnoses: draft.diagnoses, diagnosedOn, initialRisk: draft.initialRisk,
        initialRiskReason: draft.initialRiskReason,
        diabetesTreatmentPhase: hasDiabetesDiagnosis ? (draft.diabetesTreatmentPhase || null) : null,
        hypertensionTreatmentPhase: hasHypertensionDiagnosis ? (draft.hypertensionTreatmentPhase || null) : null,
        consent: consentChanged ? {
          event: draft.consentGranted ? "granted" : "revoked", noticeVersion: draft.noticeVersion,
          method: draft.consentMethod, evidenceNote: draft.evidenceNote,
        } : null,
      } });
    if (!parsed.success) {
      let firstField: keyof PatientDraft | null = null;
      for (const issue of parsed.error.issues) {
        const name = (issue.path[0] === "input" ? issue.path[1] : issue.path[0]) as keyof PatientDraft;
        if (name in draft) {
          setError(name, { message: "Revisa este campo." });
          firstField ??= name;
        }
      }
      setSaveError("Revisa los datos antes de guardar.");
      if (firstField && firstField !== "diagnoses") {
        queueMicrotask(() => {
          try {
            setFocus(firstField!);
          } catch {
            /* ignore missing field ref */
          }
        });
      }
      return;
    }
    try {
      saving.current = true;
      const result = await savePatient(parsed.data);
      if (result.error) {
        setSaveError(result.error.code === "CONFLICT"
          ? "El expediente cambió o sus identificadores ya están registrados. Vuelve al censo y revisa los datos antes de reintentar."
          : result.error.message);
        return;
      }
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
      router.push(`/pacientes/${result.data.id}`);
      router.refresh();
    } catch {
      setSaveError("No se pudo confirmar el guardado. Revisa el censo antes de reintentar.");
    } finally {
      saving.current = false;
    }
  }
  function error(name: keyof PatientDraft) {
    const message = errors[name]?.message as string | undefined;
    return message ? (
      <span id={`${name}-error`} className="field-error" role="alert">
        {message}
      </span>
    ) : null;
  }
  const a11y = (name: keyof PatientDraft) => ({
    "aria-invalid": Boolean(errors[name]) || undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form
      className="patient-form mt-6 grid gap-4"
      noValidate
      onSubmit={(event) => { void handleSubmit(submit)(event); }}
      aria-busy={isSubmitting}
    >
      <fieldset disabled={isSubmitting} className="patient-form-layout">
      <section className="form-section patient-identity" aria-labelledby="patient-identity-heading">
        <div className="form-section-heading">
          <span className="section-number">01</span>
          <div>
            <h2 id="patient-identity-heading">Identificación y contacto</h2>
            <p>Los datos que vinculan a la persona con su expediente.</p>
          </div>
        </div>
        <p className="care-group-heading">Datos personales</p>
        <div className="form-fields patient-personal-fields">
          <label>
            Nombre completo
            <input
              autoComplete="name"
              {...register("fullName", {
                required: "Escribe el nombre completo.",
                validate: (value) =>
                  value.trim().length >= 3 ||
                  "Escribe al menos tres caracteres.",
              })}
              {...a11y("fullName")}
            />
            {error("fullName")}
          </label>
          <label>
            Fecha de nacimiento
            <input
              type="date"
              {...register("birthDate", {
                required: "Selecciona la fecha de nacimiento.",
                validate: validateBirthDate,
              })}
              {...a11y("birthDate")}
            />
            {error("birthDate")}
          </label>
          <label>
            Sexo
            <select {...register("sex")}>
              <option value="unknown">No especificado</option>
              <option value="female">Femenino</option>
              <option value="male">Masculino</option>
              <option value="intersex">Intersex</option>
            </select>
          </label>
        </div>
        <p className="care-group-heading">Identificadores y contacto</p>
        <div className="form-fields">
          <label>
            Expediente clínico
            <input
              {...register("clinicalRecord", {
                validate: (value) =>
                  Boolean(value?.trim()) || "Escribe el número de expediente.",
              })}
              {...a11y("clinicalRecord")}
            />
            {error("clinicalRecord")}
          </label>
          <label>
            <span className="patient-field-label">CURP <span className="field-hint">Opcional</span></span>
            <input
              maxLength={18}
              {...register("curp", {
                setValueAs: (value) => value.trim().toUpperCase(),
                pattern: {
                  value: /^[A-Z0-9]{18}$/,
                  message: "La CURP debe tener 18 caracteres alfanuméricos.",
                },
              })}
              {...a11y("curp")}
            />
            {error("curp")}
          </label>
          <label>
            Grupo sanguíneo
            <select {...register("bloodType")}>
              <option value="">No registrado</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
              <option value="unknown">Desconocido</option>
            </select>
          </label>
          <label>
            WhatsApp
            <input
              type="tel"
              readOnly={Boolean(initial)}
              autoComplete="tel"
              placeholder="+525512345678"
              {...register("whatsappE164", {
                required: "Escribe el número de WhatsApp.",
                pattern: {
                  value: /^\+[1-9][0-9]{7,14}$/,
                  message:
                    "Usa el formato internacional: +, código de país y número.",
                },
              })}
              {...a11y("whatsappE164")}
            />
            {error("whatsappE164")}
          </label>
        </div>
      </section>
      <section className="form-section patient-assessment" aria-labelledby="patient-assessment-heading">
        <div className="form-section-heading">
          <span className="section-number">02</span>
          <div>
            <h2 id="patient-assessment-heading">Valoración inicial</h2>
            <p>Diagnósticos y prioridad indicada por el equipo médico.</p>
          </div>
        </div>
        <fieldset
          aria-describedby={errors.diagnoses ? "diagnoses-error" : undefined}
          aria-invalid={Boolean(errors.diagnoses) || undefined}
          className="mb-4"
        >
          <legend className="care-group-heading">
            Diagnósticos
          </legend>
          <div className="patient-diagnosis-grid">
            {diagnoses.map(([code, label]) => (
              <div key={code}>
                <label className="diagnosis-option">
                  <input
                    type="checkbox"
                    value={code}
                    {...register("diagnoses", {
                      validate: (values) =>
                        values.length > 0 ||
                        "Selecciona al menos un diagnóstico.",
                    })}
                  />
                  <span>{label}</span>
                </label>
                {watchedDiagnoses?.includes(code) ? (
                  <label className="mt-1.5 block pl-1 text-xs font-semibold text-slate-600">
                    Fecha de diagnóstico <span className="field-hint">Opcional</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm font-normal"
                      max={new Date().toISOString().slice(0, 10)}
                      type="date"
                      {...register(`diagnosedOn.${code}` as const)}
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </div>
          {error("diagnoses")}
          {isComorbid ? (
            <p className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              Comorbilidad: diabetes + hipertensión
            </p>
          ) : null}
        </fieldset>
        <p className="care-group-heading">Prioridad</p>
        <div className="form-fields">
          <label>
            Prioridad inicial
            <select {...register("initialRisk")}>
              <option value="unknown">Sin evaluar</option>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <label>
            Motivo de la valoración
            <textarea
              rows={3}
              {...register("initialRiskReason", {
                validate: (value) =>
                  Boolean(value?.trim()) ||
                  "Describe el motivo de la valoración.",
              })}
              {...a11y("initialRiskReason")}
            />
            {error("initialRiskReason")}
          </label>
        </div>
      </section>
      {(hasDiabetesDiagnosis || hasHypertensionDiagnosis) ? (
        <section className="form-section patient-treatment" aria-labelledby="patient-treatment-heading">
          <div className="form-section-heading">
            <span className="section-number">03</span>
            <div>
              <h2 id="patient-treatment-heading">Fase de tratamiento</h2>
              <p>A criterio médico; no hay ningún cálculo automático que la reclasifique.</p>
            </div>
          </div>
          <div className="form-fields">
            {hasDiabetesDiagnosis ? (
              <label>
                Fase de tratamiento — diabetes
                <select {...register("diabetesTreatmentPhase")}>
                  <option value="">Sin definir</option>
                  {diabetesTreatmentPhases.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {hasHypertensionDiagnosis ? (
              <label>
                Fase de tratamiento — hipertensión
                <select {...register("hypertensionTreatmentPhase")}>
                  <option value="">Sin definir</option>
                  {hypertensionTreatmentPhases.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </section>
      ) : null}
      <section className="form-section patient-consent" aria-labelledby="patient-consent-heading">
        <div className="form-section-heading">
          <span className="section-number">04</span>
          <div>
            <h2 id="patient-consent-heading">Consentimiento de contacto</h2>
            <p>
              Registrar un paciente no requiere activar los mensajes
              automatizados.
            </p>
          </div>
        </div>
        <label className="diagnosis-option">
          <input type="checkbox" {...register("consentGranted")} />
          <span>
            El paciente otorgó consentimiento para automatización por WhatsApp.
          </span>
        </label>
        {consentChanged ? (
          <div className="form-fields mt-3 clinical-page-content">
            <label>
              Versión del aviso
              <input
                {...register("noticeVersion", {
                  validate: (value) =>
                    !consentChanged ||
                    Boolean(value?.trim()) ||
                    "Escribe la versión del aviso presentado.",
                })}
                {...a11y("noticeVersion")}
              />
              {error("noticeVersion")}
            </label>
            <label>
              Método
              <select {...register("consentMethod")}>
                <option value="in_person">Presencial</option>
                <option value="written">Escrito</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              Evidencia del cambio de consentimiento
              <textarea
                rows={3}
                {...register("evidenceNote", {
                  validate: (value) =>
                    !consentChanged ||
                    Boolean(value?.trim()) ||
                    "Describe la evidencia del consentimiento.",
                })}
                {...a11y("evidenceNote")}
              />
              {error("evidenceNote")}
            </label>
          </div>
        ) : null}
      </section>
      {!initial ? (
        <section className="form-section patient-care" aria-labelledby="patient-care-heading">
          <div className="form-section-heading">
            <span className="section-number">05</span>
            <div>
              <h2 id="patient-care-heading">Receta y monitoreo iniciales</h2>
              <p>Opcional. Se guarda en la misma operación que el alta; se puede omitir y configurar después.</p>
            </div>
          </div>
          <div className="patient-care-layout">
          <div className="patient-prescription">
          <p className="care-group-heading">Tratamiento farmacológico</p>
          <div className="care-module">
            <label className="care-module-toggle">
              <input type="checkbox" disabled={medications.length === 0} {...register("prescriptionEnabled")} />
              <span>
                Receta inicial
                {medications.length === 0 ? <span className="field-hint"> — no hay medicamentos activos en la unidad</span> : null}
              </span>
            </label>
            {prescriptionEnabled ? (
              <div className="care-module-body form-fields clinical-page-content">
                <label htmlFor={medicationFieldId}>
                  Medicamento
                  <select id={medicationFieldId} {...register("prescriptionMedicationId", {
                    validate: value => (!prescriptionEnabled || Boolean(value)) || "Selecciona un medicamento.",
                  })} {...a11y("prescriptionMedicationId")}>
                    <option value="">Selecciona…</option>
                    {medications.map(medication => (
                      <option key={medication.id} value={medication.id}>
                        {medication.name}{medication.strength ? ` (${medication.strength})` : ""}
                      </option>
                    ))}
                  </select>
                  {error("prescriptionMedicationId")}
                </label>
                <label>
                  Dosis
                  <input {...register("prescriptionDoseText", {
                    validate: value => (!prescriptionEnabled || Boolean(value?.trim())) || "Escribe la dosis.",
                  })} {...a11y("prescriptionDoseText")} />
                  {error("prescriptionDoseText")}
                </label>
                <label>
                  <span className="patient-field-label">Fecha final <span className="field-hint">Opcional</span></span>
                  <input type="date" {...register("prescriptionEndsAt")} />
                </label>
                <label className="sm:col-span-2 lg:col-span-3">
                  Indicaciones
                  <textarea rows={2} {...register("prescriptionInstructions")} />
                </label>
                <fieldset className="sm:col-span-2 lg:col-span-3">
                  <legend className="care-group-heading">Horarios</legend>
                  {scheduleFields.map((field, index) => (
                    <div className="patient-schedule-row" key={field.id}>
                      <select {...register(`prescriptionSchedules.${index}.weekday` as const)}>
                        {weekdayLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <input type="time" {...register(`prescriptionSchedules.${index}.localTime` as const)} />
                      <button className="clinical-button patient-schedule-remove"
                        disabled={scheduleFields.length <= 1} onClick={() => removeSchedule(index)} type="button">
                        Quitar
                      </button>
                    </div>
                  ))}
                  <button className="clinical-button patient-schedule-add"
                    onClick={() => appendSchedule({ weekday: "1", localTime: "08:00" })} type="button">
                    + Agregar horario
                  </button>
                </fieldset>
              </div>
            ) : null}
          </div>
          </div>
          <div className="patient-monitoring">
          <p className="care-group-heading">Monitoreo en casa</p>
          <div className="care-module">
            <label className="care-module-toggle">
              <input type="checkbox" {...register("glucoseFastingPlanEnabled")} />
              <span>Glucosa en ayuno</span>
            </label>
            {glucoseFastingPlanEnabled ? (
              <div className="care-module-body form-fields clinical-page-content">
                <label>
                  Hora
                  <input type="time" {...register("glucoseFastingLocalTime")} />
                </label>
                <label>
                  Contexto
                  <select {...register("glucoseFastingContext")}>
                    <option value="fasting">Ayuno</option>
                    <option value="before_meal">Antes de comer</option>
                    <option value="random">Aleatorio</option>
                    <option value="unspecified">Sin especificar</option>
                  </select>
                </label>
                <fieldset className="sm:col-span-2 lg:col-span-3">
                  <legend className="care-group-heading">Días</legend>
                  <div className="flex flex-wrap gap-3">
                    {weekdayLabels.map(([value, label]) => (
                      <label className="diagnosis-option" key={value}>
                        <input type="checkbox" value={value} {...register("glucoseFastingWeekdays")} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="field-grid-tight">
                  <label>Objetivo mínimo (mg/dL) <span className="field-hint">Opcional</span><input type="number" {...register("glucoseFastingMin")} /></label>
                  <label>Objetivo máximo (mg/dL) <span className="field-hint">Opcional</span><input type="number" {...register("glucoseFastingMax")} /></label>
                  <label>Crítico mínimo (mg/dL) <span className="field-hint">Opcional</span><input type="number" {...register("glucoseFastingCriticalMin")} /></label>
                  <label>Crítico máximo (mg/dL) <span className="field-hint">Opcional</span><input type="number" {...register("glucoseFastingCriticalMax")} /></label>
                </div>
              </div>
            ) : null}
          </div>
          <div className="care-module">
            <label className="care-module-toggle">
              <input type="checkbox" {...register("glucosePostprandialPlanEnabled")} />
              <span>Glucosa postprandial</span>
            </label>
            {glucosePostprandialPlanEnabled ? (
              <div className="care-module-body form-fields clinical-page-content">
                <label>
                  Hora <span className="field-hint">Ej. 2h después del desayuno</span>
                  <input type="time" {...register("glucosePostprandialLocalTime")} />
                </label>
                <fieldset className="sm:col-span-2 lg:col-span-3">
                  <legend className="care-group-heading">Días</legend>
                  <div className="flex flex-wrap gap-3">
                    {weekdayLabels.map(([value, label]) => (
                      <label className="diagnosis-option" key={value}>
                        <input type="checkbox" value={value} {...register("glucosePostprandialWeekdays")} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="field-grid-tight">
                  <label>Objetivo mínimo (mg/dL) <span className="field-hint">Opcional</span><input type="number" {...register("glucosePostprandialMin")} /></label>
                  <label>Objetivo máximo (mg/dL) <span className="field-hint">Opcional</span><input type="number" {...register("glucosePostprandialMax")} /></label>
                  <label>Crítico mínimo (mg/dL) <span className="field-hint">Opcional</span><input type="number" {...register("glucosePostprandialCriticalMin")} /></label>
                  <label>Crítico máximo (mg/dL) <span className="field-hint">Opcional</span><input type="number" {...register("glucosePostprandialCriticalMax")} /></label>
                </div>
              </div>
            ) : null}
          </div>
          <div className="care-module">
            <label className="care-module-toggle">
              <input type="checkbox" {...register("bpPlanEnabled")} />
              <span>Presión arterial</span>
            </label>
            {bpPlanEnabled ? (
              <div className="care-module-body form-fields clinical-page-content">
                <label>
                  Hora
                  <input type="time" {...register("bpLocalTime")} />
                </label>
                <fieldset className="sm:col-span-2 lg:col-span-3">
                  <legend className="care-group-heading">Días</legend>
                  <div className="flex flex-wrap gap-3">
                    {weekdayLabels.map(([value, label]) => (
                      <label className="diagnosis-option" key={value}>
                        <input type="checkbox" value={value} {...register("bpWeekdays")} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="field-grid-tight">
                  <label>Sistólica mínima <span className="field-hint">Opcional</span><input type="number" {...register("systolicMin")} /></label>
                  <label>Sistólica máxima <span className="field-hint">Opcional</span><input type="number" {...register("systolicMax")} /></label>
                  <label>Diastólica mínima <span className="field-hint">Opcional</span><input type="number" {...register("diastolicMin")} /></label>
                  <label>Diastólica máxima <span className="field-hint">Opcional</span><input type="number" {...register("diastolicMax")} /></label>
                  <label>Sistólica crítica mín. <span className="field-hint">Opcional</span><input type="number" {...register("systolicCriticalMin")} /></label>
                  <label>Sistólica crítica máx. <span className="field-hint">Opcional</span><input type="number" {...register("systolicCriticalMax")} /></label>
                  <label>Diastólica crítica mín. <span className="field-hint">Opcional</span><input type="number" {...register("diastolicCriticalMin")} /></label>
                  <label>Diastólica crítica máx. <span className="field-hint">Opcional</span><input type="number" {...register("diastolicCriticalMax")} /></label>
                </div>
              </div>
            ) : null}
          </div>
          </div>
          </div>
        </section>
      ) : null}
      {initial ? <div className="form-fields patient-edit-reason"><label>
        Motivo de la edición
        <textarea rows={3} {...register("reason", { validate: value => Boolean(value?.trim()) || "Describe el motivo de la edición." })} {...a11y("reason")} />
        {error("reason")}
      </label></div> : null}
      {saveError ? (
        <p
          ref={saveErrorRef}
          role="alert"
          tabIndex={-1}
          className="patient-save-error field-error rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 outline-none"
        >
          {saveError}
        </p>
      ) : (
        <p aria-live="polite" className="sr-only">
          {isSubmitting ? "Guardando expediente…" : ""}
        </p>
      )}
      <footer className="form-actions">
        <span className="text-xs text-slate-500">
          {initial ? "Edición del expediente" : "Alta de paciente"}
        </span>
        <div className="flex gap-3">
          <Link className="clinical-button" href="/pacientes">
            Cancelar
          </Link>
          <button
            className="clinical-button clinical-button-primary"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Guardando…" : initial ? "Guardar cambios" : "Registrar paciente"}
          </button>
        </div>
      </footer>
      </fieldset>
    </form>
  );
}
