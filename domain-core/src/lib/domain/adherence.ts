/**
 * Adherencia y cobertura de respuesta — computeAdherence() / aggregateAdherence()
 *
 * Implementa la sección 3 ("Adherencia") de kuni-plan-tecnico.md.
 *
 * Cohorte: tomas de medicamento cuyo seguimiento ya CONCLUYÓ (por respuesta o
 * por vencimiento), con entrega acreditada o respuesta manual vinculada.
 * Quien arma el arreglo `concluded` (en jobs/ o queries/) es responsable de
 * excluir: interacciones futuras, canceladas y fallos técnicos — esta
 * función asume que ya llegó filtrado así.
 *
 *   adherencia confirmada   = 100 × Y / (Y + N)
 *   cobertura de respuesta  = 100 × (Y + N) / (Y + N + U)
 *   confirmadas / cohorte   = 100 × Y / (Y + N + U)   [dato complementario]
 *
 * Denominador cero → null ("sin datos"), nunca 0% ni 100% engañoso.
 * A nivel unidad/consultorio: sumar numeradores/denominadores de todos los
 * pacientes, NUNCA promediar porcentajes individuales ya calculados —
 * por eso aggregateAdherence() sí soporta esto, y no
 * `avg(pacientes.map(p => p.confirmedAdherencePct))`.
 */

export type AdherenceOutcome = 'yes' | 'no' | 'unknown';

export interface ConcludedInteraction {
  outcome: AdherenceOutcome;
}

/** Interacciones programadas que no se pudieron contactar por falla técnica (solo para reportar, no cuentan en el cálculo). */
export interface TechnicalExclusion {
  reason: string; // p.ej. 'provider_failed' | 'blocked_window' | 'no_consent'
}

export interface AdherenceInput {
  concluded: ConcludedInteraction[];
  technicalExclusions?: TechnicalExclusion[];
}

export interface AdherenceResult {
  y: number;
  n: number;
  u: number;
  /** 100 × Y / (Y + N), o null si Y+N = 0 ("sin datos"). */
  confirmedAdherencePct: number | null;
  /** 100 × (Y + N) / (Y + N + U), o null si la cohorte está vacía. */
  responseCoveragePct: number | null;
  /** 100 × Y / (Y + N + U) — dato complementario, o null si la cohorte está vacía. */
  confirmedOverCohortPct: number | null;
  technicalExclusionsCount: number;
  /** false si la cohorte completa está vacía (nada que reportar todavía). */
  hasData: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeAdherence(input: AdherenceInput): AdherenceResult {
  let y = 0;
  let n = 0;
  let u = 0;

  for (const item of input.concluded) {
    if (item.outcome === 'yes') y += 1;
    else if (item.outcome === 'no') n += 1;
    else u += 1;
  }

  const cohortSize = y + n + u;
  const confirmedOrDenied = y + n;

  return {
    y,
    n,
    u,
    confirmedAdherencePct:
      confirmedOrDenied > 0 ? round1((100 * y) / confirmedOrDenied) : null,
    responseCoveragePct:
      cohortSize > 0 ? round1((100 * confirmedOrDenied) / cohortSize) : null,
    confirmedOverCohortPct: cohortSize > 0 ? round1((100 * y) / cohortSize) : null,
    technicalExclusionsCount: input.technicalExclusions?.length ?? 0,
    hasData: cohortSize > 0,
  };
}

/**
 * Agrega adherencia de varios pacientes (unidad/consultorio) sumando
 * numeradores y denominadores — NO promedia porcentajes ya calculados.
 * Cada paciente cuenta una sola vez en el total de la cohorte, sin
 * importar cuántas interacciones tenga.
 */
export function aggregateAdherence(inputs: AdherenceInput[]): AdherenceResult {
  const merged: ConcludedInteraction[] = [];
  let technicalExclusionsCount = 0;

  for (const input of inputs) {
    merged.push(...input.concluded);
    technicalExclusionsCount += input.technicalExclusions?.length ?? 0;
  }

  const result = computeAdherence({ concluded: merged });
  return { ...result, technicalExclusionsCount };
}
