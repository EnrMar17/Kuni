import { describe, expect, it } from 'vitest';
import { parseMlResponse, requestMlPrediction } from '../../src/lib/ml/client';

describe('requestMlPrediction — regla de oro: nunca tumba el dashboard', () => {
  it('devuelve todo null sin llamar a la red cuando no hay endpointUrl configurado', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error('no debería llamarse');
    }) as unknown as typeof fetch;

    const result = await requestMlPrediction({}, { endpointUrl: null, fetchImpl });
    expect(called).toBe(false);
    expect(result).toEqual({
      probabilidadEmpeoramientoFuturo: null,
      modelVersion: null,
      datosSuficientes: null,
    });
  });

  it('devuelve todo null si el fetch lanza (red caída / timeout)', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await requestMlPrediction(
      {},
      { endpointUrl: 'https://modelo.example/predict', fetchImpl },
    );
    expect(result.probabilidadEmpeoramientoFuturo).toBeNull();
    expect(result.datosSuficientes).toBeNull();
  });

  it('devuelve todo null si la respuesta HTTP no es ok (4xx/5xx)', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({}), { status: 500 })) as unknown as typeof fetch;

    const result = await requestMlPrediction(
      {},
      { endpointUrl: 'https://modelo.example/predict', fetchImpl },
    );
    expect(result.modelVersion).toBeNull();
  });

  it('parsea correctamente una respuesta válida con la forma exacta de su nuevo contrato simplificado', async () => {
    const body = {
      probabilidad_empeoramiento_futuro: 0.73,
      model_version: 'prediccion_futura_v1_2026-09-08',
      datos_suficientes: {
        glucosa_ayuno: true,
        glucosa_postprandial: false,
        presion_arterial: true,
      },
    };
    const fetchImpl = (async () =>
      new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

    const result = await requestMlPrediction(
      {},
      { endpointUrl: 'https://modelo.example/predict', fetchImpl },
    );
    expect(result).toEqual({
      probabilidadEmpeoramientoFuturo: 0.73,
      modelVersion: 'prediccion_futura_v1_2026-09-08',
      datosSuficientes: {
        glucosaAyuno: true,
        glucosaPostprandial: false,
        presionArterial: true,
      },
    });
  });

  it('manda el API key como Bearer y el vector de features como body JSON', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ probabilidad_empeoramiento_futuro: 0.2 }), { status: 200 });
    }) as unknown as typeof fetch;

    await requestMlPrediction(
      { edad: 58 },
      { endpointUrl: 'https://modelo.example/predict', apiKey: 'secreto123', fetchImpl },
    );

    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer secreto123');
    expect(capturedInit?.body).toBe(JSON.stringify({ edad: 58 }));
  });
});

describe('parseMlResponse — validación defensiva de forma', () => {
  it('ya NO expone nivel_riesgo_actual ni alerta_roja aunque el endpoint los mande (contrato viejo/error de otro lado)', () => {
    const result = parseMlResponse({
      nivel_riesgo_actual: 'alto',
      alerta_roja: true,
      probabilidad_empeoramiento_futuro: 0.5,
    });
    expect(result).not.toHaveProperty('nivelRiesgoActual');
    expect(result).not.toHaveProperty('alertaRoja');
    expect(result.probabilidadEmpeoramientoFuturo).toBe(0.5);
  });

  it('descarta una probabilidad fuera de rango [0,1]', () => {
    const result = parseMlResponse({ probabilidad_empeoramiento_futuro: 1.5 });
    expect(result.probabilidadEmpeoramientoFuturo).toBeNull();
  });

  it('datosSuficientes es null si el objeto viene incompleto o con tipos incorrectos', () => {
    expect(parseMlResponse({ datos_suficientes: { glucosa_ayuno: true } }).datosSuficientes).toBeNull();
    expect(
      parseMlResponse({ datos_suficientes: { glucosa_ayuno: 'si', glucosa_postprandial: true, presion_arterial: true } })
        .datosSuficientes,
    ).toBeNull();
  });

  it('no truena con un cuerpo vacío o de forma inesperada', () => {
    expect(() => parseMlResponse(null)).not.toThrow();
    expect(() => parseMlResponse('texto plano')).not.toThrow();
    expect(() => parseMlResponse([])).not.toThrow();
    expect(parseMlResponse(null).probabilidadEmpeoramientoFuturo).toBeNull();
  });
});
