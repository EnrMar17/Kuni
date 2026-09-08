/**
 * Contratos compartidos (DTO/enums) para Kuni.
 *
 * Congelados según kuni-plan-tecnico.md sección 5 ("Contratos para avanzar
 * en paralelo") y persona-c-tareas.md sección 4. Usar EXACTAMENTE estos
 * valores de enum en la base de datos / lógica; las traducciones a español
 * viven solo en la capa de UI, nunca aquí ni en la BD.
 *
 * Nota para A y B: si cambian la forma de estos tipos, avisar a los tres,
 * porque domain/risk.ts, domain/adherence.ts y whatsapp/parser.ts (de C)
 * dependen de ellos.
 */

// ---------------------------------------------------------------------------
// Enums de estado (deben coincidir 1:1 con los `check` del DDL)
// ---------------------------------------------------------------------------

export type AppointmentStatus = 'scheduled' | 'completed' | 'missed' | 'cancelled';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export type PrescriptionStatus =
  | 'draft'
  | 'active'
  | 'superseded'
  | 'stopped'
  | 'completed';

// ---------------------------------------------------------------------------
// Envelope de respuesta común para Server Actions / RPC
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'PROVIDER_UNAVAILABLE';

export interface ApiError {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
}

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

// ---------------------------------------------------------------------------
// DTOs de dominio que C consume/produce
// ---------------------------------------------------------------------------

/** Variable clínica medible. La presión se registra como un par sistólica/diastólica. */
export type MeasurementVariable = 'glucose' | 'blood_pressure';

export type GlucoseContext = 'fasting' | 'before_meal' | 'after_meal' | 'random' | 'unspecified';

export type InteractionKind = 'medication' | 'measurement' | 'appointment' | 'nonresponse_summary';

export type DeliveryStatus =
  | 'queued' | 'sending' | 'accepted' | 'delivered' | 'read' | 'failed'
  | 'cancelled' | 'blocked_window' | 'blocked_template' | 'unknown';

/** Entrada para registrar/corregir una medición (usado por correctMeasurement). */
export interface MeasurementInput {
  patientId: string;
  variable: MeasurementVariable;
  glucose?: {
    valueMgDl: number;
    context: GlucoseContext;
  };
  bloodPressure?: {
    systolicMmHg: number;
    diastolicMmHg: number;
  };
  observedAt: string; // ISO, cuándo ocurrió la medición (no cuándo se recibió)
  receivedAt: string; // ISO, cuándo llegó al sistema
  source: 'whatsapp' | 'manual' | 'image_reviewed';
  interactionId?: string | null; // referencia al bot_interaction si vino del bot
  correctionReason?: string | null; // obligatorio si es una corrección
}

/** Rangos personalizados por paciente/variable/contexto (RF12). */
export interface MeasurementThresholds {
  targetMin?: number | null;
  targetMax?: number | null;
  criticalMin?: number | null;
  criticalMax?: number | null;
}

/** Resultado de una evaluación de riesgo (persistido en risk_assessments). */
export interface RiskResult {
  level: RiskLevel;
  ruleVersion: string;
  reasons: string[];
  evaluatedAt: string; // ISO
  inputsUsed: {
    measurementsConsidered: number;
    pendingTimeoutsLast7Days: number;
    urgentFlagActive: boolean;
    initialAssessmentLevel: RiskLevel | null;
  };
}

/** Entrada para adjustPrescription. */
export interface PrescriptionVersionInput {
  patientId: string;
  medicationId: string;
  doseText: string;
  instructions: string;
  startsAt: string; // date ISO
  endsAt: string | null;
  schedules: Array<{
    weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO 1=lunes .. 7=domingo
    localTime: string; // "HH:mm"
  }>;
  prescribedByDoctorId: string;
  previousPrescriptionId?: string | null;
}

/** Entrada para resolveAlert. */
export interface AlertResolutionInput {
  alertId: string;
  nextStatus: Extract<AlertStatus, 'resolved' | 'dismissed'>;
  reason: string;
  resolvedByUserId: string;
}
