/**
 * Adaptador C2 — traduce un `DashboardPatient` (el DTO que ya arma
 * `buildDashboardData()`) al `MlFeatureInput` que espera
 * `buildMlFeatureVector()` de `domain-core` (RF29/RF30).
 *
 * Deliberadamente NO recalcula nada que `dashboard.ts` ya calculó (edad,
 * medidas, adherencia general): solo reorganiza lo que ya existe en la
 * forma que pide el contrato del modelo. Las piezas que todavía no se
 * pueden calcular (adherencia por clase terapéutica — B4, complicaciones —
 * B3) se mandan como `null` a propósito: `buildMlFeatureVector()` las
 * declara en `gaps`, nunca las disfraza de dato observado.
 */
import "server-only";
import type { Reading } from "../../../domain-core/src/lib/domain/trend";
import type { MlFeatureInput } from "../../../domain-core/src/lib/ml/features";
import type { DashboardPatient } from "../domain/dashboard";

function readings(patient: DashboardPatient, kind: "glucose" | "blood_pressure", context?: string, pick?: "systolic" | "diastolic"): Reading[] {
  return patient.measurements
    .filter((m) => m.kind === kind && (context == null || m.context === context))
    .map((m): Reading | null => {
      const value = kind === "glucose" ? m.glucoseMgDl : pick === "systolic" ? m.systolicMmHg : m.diastolicMmHg;
      return value == null ? null : { value, observedAt: m.observedAt };
    })
    .filter((r): r is Reading => r != null);
}

/**
 * Construye el input del vector de 17 variables para UN paciente.
 *
 * Ojo — llamar esto una sola vez por paciente seleccionado, nunca por cada
 * fila del censo al cargar el tablero (lo advierte tanto el equipo de IA
 * como el plan de integración de Kuni).
 */
export function buildPatientMlFeatureInput(patient: DashboardPatient): MlFeatureInput {
  return {
    age: patient.age,
    diagnoses: patient.diagnosisCodes,
    fastingGlucose: readings(patient, "glucose", "fasting"),
    postprandialGlucose: readings(patient, "glucose", "after_meal"),
    systolic: readings(patient, "blood_pressure", undefined, "systolic"),
    diastolic: readings(patient, "blood_pressure", undefined, "diastolic"),
    // Gap conocido hasta B4 (clasificación por clase terapéutica en `medications`).
    antidiabeticAdherence: null,
    antihypertensiveAdherence: null,
    // Gap conocido hasta B3 (migración RF28 `patient_complications`).
    complications: null,
  };
}
