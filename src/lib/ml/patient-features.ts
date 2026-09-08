/**
 * Adaptador C2 — traduce un `DashboardPatient` (el DTO que ya arma
 * `buildDashboardData()`) al `MlFeatureInput` que espera
 * `buildMlFeatureVector()` de `domain-core` (RF29/RF30).
 *
 * Deliberadamente NO recalcula nada que `dashboard.ts` ya calculó (edad,
 * medidas, adherencia general, complicaciones RF28): solo reorganiza lo que
 * ya existe en la forma que pide el contrato del modelo. Adherencia por
 * clase terapéutica sigue sin poder calcularse (B4, `medications` todavía
 * no clasifica por clase) y se manda `null` a propósito:
 * `buildMlFeatureVector()` lo declara en `gaps`, nunca lo disfraza de dato
 * observado.
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
    // RF28 ya migrada (B3): `null` real solo cuando el expediente no tiene
    // revisión (ninguna fila), nunca cuando el médico ya declaró "sin
    // complicaciones" (`["E119"]`) — esos dos casos no son lo mismo.
    complications: patient.complicationCodes == null ? null : { codes: patient.complicationCodes },
  };
}
