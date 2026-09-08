import { computeAdherence } from "../../domain-core/src/lib/domain/adherence";
import type { DashboardData, DashboardPatient } from "@/lib/domain/dashboard";

export const testNow = "2026-09-08T12:00:00.000Z";

export function patient(id: string, name: string, level: DashboardPatient["risk"]["level"] = "unknown"): DashboardPatient {
  return {
    id, fullName: name, clinicalRecord: `EXP-${id}`, curp: null,
    birthDate: "1970-01-01", age: 56, sex: "unknown", bloodType: null,
    whatsappE164: "+525500000000", diagnoses: [], diagnosisCodes: [], complicationCodes: null, consentGranted: false, lastResponseAt: null,
    initialRiskReason: null,
    risk: { level, reasons: ["Sin evaluación suficiente"], ruleVersion: "test", evaluatedAt: testNow, inputsUsed: { measurementsConsidered: 0, pendingTimeoutsLast7Days: 0, urgentFlagActive: false, initialAssessmentLevel: null } },
    adherence: computeAdherence({ concluded: [] }), nonresponse: { historical: 0, pending: 0 },
    measurements: [], latestGlucose: null, latestBloodPressure: null,
    prescriptions: [], appointments: [], alerts: [], complications: [], interactions: [],
  };
}

export function dashboard(patients: DashboardPatient[] = []): DashboardData {
  return {
    generatedAt: testNow, timezone: "America/Mexico_City", hasMorePatients: false,
    patients, appointments: [], alerts: [],
    metrics: { activePatients: patients.length, highRiskPatients: 0, activeAlerts: 0, criticalAlerts: 0,
      meanFastingGlucoseMgDl: null, fastingGlucoseCount: 0, adherence: computeAdherence({ concluded: [] }) },
  };
}
