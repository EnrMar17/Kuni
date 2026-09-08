import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPatientInputSchema, measurementInputSchema, patientDetailSchema } from '../../../src/contracts/clinical';
import { parseIncomingMessage } from '../../src/lib/whatsapp/parser';

const sql = readFileSync(new URL('../../../supabase/migrations/0001_kuni.sql', import.meta.url), 'utf8');

function sqlValues(column: string): string[] {
  const definition = sql.split('\n').find((line) => line.includes(column + ' text') && line.includes(column + ' in ('));
  if (!definition) throw new Error('No se encontró el contrato SQL de ' + column);
  return [...definition.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe('contratos de aplicación y parser frente al DDL', () => {
  it('alta y ficha aceptan exactamente los valores de sexo almacenados', () => {
    const allowed = sqlValues('sex');
    expect(createPatientInputSchema.shape.sex.options).toEqual(allowed);
    expect(patientDetailSchema.shape.sex.options).toEqual(allowed);
    expect(createPatientInputSchema.shape.sex.safeParse('other').success).toBe(false);
  });

  it.each(['AYUNO', 'POSPRANDIAL', 'POSTPRANDIAL'])('una respuesta con %s pasa al contrato clínico y a SQL', (contextText) => {
    const parsed = parseIncomingMessage('GLUCOSA ABCD1234 120 ' + contextText);
    if (parsed.kind !== 'measurement_report' || parsed.variable !== 'glucose') throw new Error('Reporte esperado');
    const input = measurementInputSchema.parse({
      kind: 'glucose', patientId: '11111111-1111-4111-8111-111111111111',
      observedAt: '2026-09-08T12:00:00Z', glucoseMgDl: parsed.valueMgDl, context: parsed.context,
    });
    expect(sqlValues('measurement_context')).toContain(parsed.context);
    expect(input.kind).toBe('glucose');
  });

  it('no permite que el vocabulario antiguo llegue directamente a persistencia', () => {
    const parsed = measurementInputSchema.safeParse({
      kind: 'glucose', patientId: '11111111-1111-4111-8111-111111111111',
      observedAt: '2026-09-08T12:00:00Z', glucoseMgDl: 120, context: 'postprandial',
    });
    expect(parsed.success).toBe(false);
  });
});
