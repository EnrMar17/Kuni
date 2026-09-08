"use client";

import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";

type PatientDraft = {
  fullName: string; birthDate: string; sex: string; clinicalRecord: string;
  curp: string; whatsappE164: string; bloodType: string; diagnoses: string[];
  initialRisk: string; initialRiskReason: string; consentGranted: boolean;
  noticeVersion: string; consentMethod: string; evidenceNote: string;
};

const diagnoses = [
  ["diabetes_type_1", "Diabetes tipo 1"], ["diabetes_type_2", "Diabetes tipo 2"],
  ["diabetes_gestational", "Diabetes gestacional"], ["diabetes_other", "Otra diabetes"],
  ["hypertension", "Hipertensión"], ["other", "Otro diagnóstico"],
] as const;

// React Hook Form invokes this validator on blur/submission, not during render.
function validateBirthDate(value: string) {
  return (Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now())
    || "La fecha debe ser válida y no estar en el futuro.";
}

export function PatientCreateForm() {
  const { register, handleSubmit, control, formState: { errors, isSubmitSuccessful } } = useForm<PatientDraft>({
    mode: "onTouched",
    defaultValues: { sex: "unknown", initialRisk: "unknown", bloodType: "", diagnoses: [], consentGranted: false, consentMethod: "in_person" },
  });
  const consent = useWatch({ control, name: "consentGranted" });
  function error(name: keyof PatientDraft) {
    return errors[name] ? <span id={`${name}-error`} className="field-error" role="alert">{errors[name]?.message}</span> : null;
  }
  const a11y = (name: keyof PatientDraft) => ({ "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined });

  return <form className="patient-form mt-6 grid gap-6" noValidate onSubmit={handleSubmit(() => { /* Preview only; persistence awaits the clinical command. */ })}>
    <p className="draft-notice">Preparación de alta · Puedes revisar los datos. El guardado todavía no está disponible.</p>
    <section className="form-section">
      <div className="form-section-heading"><span className="section-number">01</span><div><h2>Identificación y contacto</h2><p>Los datos que vinculan a la persona con su expediente.</p></div></div>
      <div className="form-fields">
        <label>Nombre completo<input autoComplete="name" {...register("fullName", { required: "Escribe el nombre completo.", validate: value => value.trim().length >= 3 || "Escribe al menos tres caracteres." })} {...a11y("fullName")} />{error("fullName")}</label>
        <label>Fecha de nacimiento<input type="date" {...register("birthDate", { required: "Selecciona la fecha de nacimiento.", validate: validateBirthDate })} {...a11y("birthDate")} />{error("birthDate")}</label>
        <label>Sexo<select {...register("sex")}><option value="unknown">No especificado</option><option value="female">Femenino</option><option value="male">Masculino</option><option value="intersex">Intersex</option></select></label>
        <label>Expediente clínico<input {...register("clinicalRecord", { validate: value => Boolean(value?.trim()) || "Escribe el número de expediente." })} {...a11y("clinicalRecord")} />{error("clinicalRecord")}</label>
        <label>CURP <span className="field-hint">Opcional</span><input maxLength={18} {...register("curp", { setValueAs: value => value.trim().toUpperCase(), pattern: { value: /^[A-Z0-9]{18}$/, message: "La CURP debe tener 18 caracteres alfanuméricos." } })} {...a11y("curp")} />{error("curp")}</label>
        <label>WhatsApp<input type="tel" autoComplete="tel" placeholder="+525512345678" {...register("whatsappE164", { required: "Escribe el número de WhatsApp.", pattern: { value: /^\+[1-9][0-9]{7,14}$/, message: "Usa el formato internacional: +, código de país y número." } })} {...a11y("whatsappE164")} />{error("whatsappE164")}</label>
        <label>Grupo sanguíneo<select {...register("bloodType")}><option value="">No registrado</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(value => <option key={value}>{value}</option>)}<option value="unknown">Desconocido</option></select></label>
      </div>
    </section>
    <section className="form-section">
      <div className="form-section-heading"><span className="section-number">02</span><div><h2>Valoración inicial</h2><p>Diagnósticos y prioridad indicada por el equipo médico.</p></div></div>
      <fieldset className="mb-6"><legend className="mb-3 text-sm font-bold text-slate-700">Diagnósticos</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{diagnoses.map(([code, label]) => <label className="diagnosis-option" key={code}><input type="checkbox" value={code} {...register("diagnoses", { validate: values => values.length > 0 || "Selecciona al menos un diagnóstico." })} {...a11y("diagnoses")} /><span>{label}</span></label>)}</div>{error("diagnoses")}</fieldset>
      <div className="form-fields"><label>Prioridad inicial<select {...register("initialRisk")}><option value="unknown">Sin evaluar</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label><label>Motivo de la valoración<textarea rows={3} {...register("initialRiskReason", { validate: value => Boolean(value?.trim()) || "Describe el motivo de la valoración." })} {...a11y("initialRiskReason")} />{error("initialRiskReason")}</label></div>
    </section>
    <section className="form-section">
      <div className="form-section-heading"><span className="section-number">03</span><div><h2>Consentimiento de contacto</h2><p>Registrar un paciente no requiere activar los mensajes automatizados.</p></div></div>
      <label className="diagnosis-option"><input type="checkbox" {...register("consentGranted")} /><span>El paciente otorgó consentimiento para automatización por WhatsApp.</span></label>
      {consent ? <div className="form-fields mt-5 clinical-page-content"><label>Versión del aviso<input {...register("noticeVersion", { validate: value => !consent || Boolean(value?.trim()) || "Escribe la versión del aviso presentado." })} {...a11y("noticeVersion")} />{error("noticeVersion")}</label><label>Método<select {...register("consentMethod")}><option value="in_person">Presencial</option><option value="written">Escrito</option><option value="whatsapp">WhatsApp</option><option value="other">Otro</option></select></label><label className="sm:col-span-2">Evidencia del consentimiento<textarea rows={3} {...register("evidenceNote", { validate: value => !consent || Boolean(value?.trim()) || "Describe la evidencia del consentimiento." })} {...a11y("evidenceNote")} />{error("evidenceNote")}</label></div> : null}
    </section>
    {isSubmitSuccessful ? <p role="status" className="draft-notice">Datos revisados correctamente. No se ha guardado ningún paciente.</p> : null}
    <footer className="form-actions"><span className="text-xs text-slate-500">Los datos se conservan solo mientras esta vista permanezca abierta.</span><div className="flex gap-3"><Link className="clinical-button" href="/pacientes">Cancelar</Link><button className="clinical-button clinical-button-primary" type="submit">Revisar datos <span aria-hidden="true">→</span></button></div></footer>
  </form>;
}
