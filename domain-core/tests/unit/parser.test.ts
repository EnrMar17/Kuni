import { describe, expect, it } from 'vitest';
import { parseIncomingMessage } from '../../src/lib/whatsapp/parser';

describe('parseIncomingMessage', () => {
  it('interpreta una confirmación de toma con código', () => {
    const result = parseIncomingMessage('SI A7F3');
    expect(result).toEqual({
      kind: 'medication_confirm',
      taken: true,
      referenceCode: 'A7F3',
    });
  });

  it('interpreta un rechazo de toma con código, sin importar mayúsculas/minúsculas', () => {
    const result = parseIncomingMessage('no a7f3');
    expect(result).toEqual({
      kind: 'medication_confirm',
      taken: false,
      referenceCode: 'A7F3',
    });
  });

  it('interpreta SI/NO sin código (el llamador debe resolverlo contra la única solicitud pendiente)', () => {
    const result = parseIncomingMessage('SI');
    expect(result).toEqual({
      kind: 'medication_confirm',
      taken: true,
      referenceCode: null,
    });
  });

  it('interpreta un reporte de glucosa con código', () => {
    const result = parseIncomingMessage('GLUCOSA B9K2 120');
    expect(result).toEqual({
      kind: 'measurement_report',
      variable: 'glucose',
      referenceCode: 'B9K2',
      valueMgDl: 120,
      context: 'unspecified',
    });
  });

  it('interpreta un reporte de glucosa espontáneo sin código', () => {
    const result = parseIncomingMessage('GLUCOSA 95');
    expect(result).toEqual({
      kind: 'measurement_report',
      variable: 'glucose',
      referenceCode: null,
      valueMgDl: 95,
      context: 'unspecified',
    });
  });

  it('reconoce el contexto de ayuno cuando el paciente lo incluye', () => {
    const result = parseIncomingMessage('GLUCOSA B9K2 95 AYUNO');
    expect(result).toMatchObject({ context: 'fasting', valueMgDl: 95 });
  });

  it('interpreta un reporte de presión con código', () => {
    const result = parseIncomingMessage('PRESION C6M4 120/80');
    expect(result).toEqual({
      kind: 'measurement_report',
      variable: 'blood_pressure',
      referenceCode: 'C6M4',
      systolicMmHg: 120,
      diastolicMmHg: 80,
    });
  });

  it('tolera espacios alrededor de la barra en la presión', () => {
    const result = parseIncomingMessage('PRESION C6M4 120 / 80');
    expect(result).toMatchObject({ systolicMmHg: 120, diastolicMmHg: 80 });
  });

  it('marca como no reconocido un texto que no coincide con ningún formato, sin crear datos', () => {
    const result = parseIncomingMessage('me duele la cabeza');
    expect(result.kind).toBe('unrecognized');
  });

  it('marca como no reconocido un mensaje vacío', () => {
    const result = parseIncomingMessage('   ');
    expect(result.kind).toBe('unrecognized');
  });

  it('no confunde un texto libre con un comando parecido', () => {
    const result = parseIncomingMessage('SIempre tomo mis pastillas');
    expect(result.kind).toBe('unrecognized');
  });

  it('reconoce el contexto posprandial', () => {
    const result = parseIncomingMessage('GLUCOSA B9K2 160 POSPRANDIAL');
    expect(result).toMatchObject({ context: 'after_meal' });
  });

  it('interpreta un reporte de presión espontáneo sin código', () => {
    const result = parseIncomingMessage('PRESION 130/85');
    expect(result).toEqual({
      kind: 'measurement_report',
      variable: 'blood_pressure',
      referenceCode: null,
      systolicMmHg: 130,
      diastolicMmHg: 85,
    });
  });

  it('tolera espacios extra alrededor del mensaje completo', () => {
    const result = parseIncomingMessage('   SI A7F3   ');
    expect(result).toEqual({
      kind: 'medication_confirm',
      taken: true,
      referenceCode: 'A7F3',
    });
  });

  it('no confunde "NOta médica" con un comando NO', () => {
    const result = parseIncomingMessage('NOta médica pendiente');
    expect(result.kind).toBe('unrecognized');
  });

  it('no interpreta un código de referencia demasiado corto como válido', () => {
    // El formato de referencia es de 3 a 8 caracteres; "SI A" no matchea
    // ningún patrón conocido y debe quedar como no reconocido en vez de
    // adivinar un código incompleto.
    const result = parseIncomingMessage('SI A');
    expect(result.kind).toBe('unrecognized');
  });

  it('deja sin interpretar un GLUCOSA sin valor numérico', () => {
    const result = parseIncomingMessage('GLUCOSA B9K2');
    expect(result.kind).toBe('unrecognized');
  });

  it.each(['SI ABCD1234', 'NO ABCD1234', 'GLUCOSA ABCD1234 120', 'PRESION ABCD1234 120/80'])(
    'acepta la longitud que genera SQL: %s', (message) => {
      expect(parseIncomingMessage(message)).toMatchObject({ referenceCode: 'ABCD1234' });
    },
  );

  it.each(['SI ABCD12345', 'GLUCOSA ABCD12345 120', 'PRESION ABCD12345 120/80'])(
    'rechaza referencias mayores que el contrato: %s', (message) => {
      expect(parseIncomingMessage(message).kind).toBe('unrecognized');
    },
  );

  it('traduce POSTPRANDIAL al contexto SQL after_meal', () => {
    expect(parseIncomingMessage('GLUCOSA ABCD1234 120 POSTPRANDIAL')).toMatchObject({ context: 'after_meal' });
  });
});
