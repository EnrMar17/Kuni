/**
 * Parser de mensajes entrantes de WhatsApp — parseIncomingMessage()
 *
 * Implementa la sección 3 ("Envío y correlación") de kuni-plan-tecnico.md.
 * Formatos soportados (datos de ejemplo ficticios):
 *
 *   SI A7F3
 *   NO A7F3
 *   SI                      (solo válido si hay una única solicitud pendiente compatible — lo valida quien llama)
 *   GLUCOSA B9K2 120
 *   PRESION C6M4 120/80
 *
 * Reglas:
 * - El código de referencia (ref) es corto y no se reutiliza por interacción.
 * - Un reporte espontáneo (GLUCOSA/PRESION sin código) exige que el
 *   contexto se resuelva después contra la solicitud pendiente compatible;
 *   este parser solo separa los datos, no decide si hay una pendiente.
 * - Si el contexto de glucosa no viene en el mensaje, se marca 'unspecified'
 *   (lo aporta el plan de monitoreo, no se adivina aquí).
 * - Texto no interpretable → 'unrecognized' (el llamador debe responder
 *   ayuda, sin crear ninguna medición ni confirmación).
 * - Esta función NO valida plausibilidad clínica (ver validation.ts) ni
 *   verifica que el remitente sea dueño de la interacción (responsabilidad
 *   de la capa que llama, que sí conoce al paciente).
 */

import type { GlucoseContext } from '../../contracts/dto';
export type { GlucoseContext } from '../../contracts/dto';

export interface ParsedMedicationConfirm {
  kind: 'medication_confirm';
  taken: boolean;
  /** null si el mensaje vino sin código (resolver contra la única solicitud pendiente compatible, si existe). */
  referenceCode: string | null;
}

export interface ParsedGlucoseReport {
  kind: 'measurement_report';
  variable: 'glucose';
  referenceCode: string | null;
  valueMgDl: number;
  context: GlucoseContext;
}

export interface ParsedBloodPressureReport {
  kind: 'measurement_report';
  variable: 'blood_pressure';
  referenceCode: string | null;
  systolicMmHg: number;
  diastolicMmHg: number;
}

export type ParsedMeasurementReport = ParsedGlucoseReport | ParsedBloodPressureReport;

export interface ParsedUnrecognized {
  kind: 'unrecognized';
  rawText: string;
  reason: string;
}

export type ParsedMessage =
  | ParsedMedicationConfirm
  | ParsedMeasurementReport
  | ParsedUnrecognized;

// SQL genera 8 caracteres; los ejemplos cortos conservan compatibilidad.
const REFERENCE_CODE_PATTERN = '[A-Z0-9]{3,8}';

const CONFIRM_WITH_CODE_RE = new RegExp(
  `^\\s*(SI|NO)\\s+(${REFERENCE_CODE_PATTERN})\\s*$`,
  'i',
);
const CONFIRM_WITHOUT_CODE_RE = /^\s*(SI|NO)\s*$/i;

const GLUCOSE_RE = new RegExp(
  `^\\s*GLUCOSA(?:\\s+(${REFERENCE_CODE_PATTERN}))?\\s+(\\d{1,3})(?:\\s+(AYUNO|POSPRANDIAL|POSTPRANDIAL))?\\s*$`,
  'i',
);

const PRESION_RE = new RegExp(
  `^\\s*PRESION(?:\\s+(${REFERENCE_CODE_PATTERN}))?\\s+(\\d{2,3})\\s*\\/\\s*(\\d{2,3})\\s*$`,
  'i',
);

function normalizeContext(raw: string | undefined): GlucoseContext {
  if (!raw) return 'unspecified';
  const upper = raw.toUpperCase();
  if (upper === 'AYUNO') return 'fasting';
  if (upper === 'POSPRANDIAL' || upper === 'POSTPRANDIAL') return 'after_meal';
  return 'unspecified';
}

export function parseIncomingMessage(rawText: string): ParsedMessage {
  const text = rawText.trim();

  if (text.length === 0) {
    return { kind: 'unrecognized', rawText, reason: 'Mensaje vacío.' };
  }

  const confirmWithCode = text.match(CONFIRM_WITH_CODE_RE);
  if (confirmWithCode) {
    const [, verb, code] = confirmWithCode;
    return {
      kind: 'medication_confirm',
      taken: verb.toUpperCase() === 'SI',
      referenceCode: code.toUpperCase(),
    };
  }

  const confirmWithoutCode = text.match(CONFIRM_WITHOUT_CODE_RE);
  if (confirmWithoutCode) {
    const [, verb] = confirmWithoutCode;
    return {
      kind: 'medication_confirm',
      taken: verb.toUpperCase() === 'SI',
      referenceCode: null,
    };
  }

  const glucoseMatch = text.match(GLUCOSE_RE);
  if (glucoseMatch) {
    const [, code, valueStr, contextRaw] = glucoseMatch;
    return {
      kind: 'measurement_report',
      variable: 'glucose',
      referenceCode: code ? code.toUpperCase() : null,
      valueMgDl: Number(valueStr),
      context: normalizeContext(contextRaw),
    };
  }

  const presionMatch = text.match(PRESION_RE);
  if (presionMatch) {
    const [, code, sysStr, diaStr] = presionMatch;
    return {
      kind: 'measurement_report',
      variable: 'blood_pressure',
      referenceCode: code ? code.toUpperCase() : null,
      systolicMmHg: Number(sysStr),
      diastolicMmHg: Number(diaStr),
    };
  }

  return {
    kind: 'unrecognized',
    rawText,
    reason: 'No coincide con ningún formato esperado (SI/NO, GLUCOSA, PRESION).',
  };
}
