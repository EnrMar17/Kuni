import { describe, expect, it, vi } from 'vitest';
import { parseMlResponse, requestMlPrediction } from '../../src/lib/ml/client';

const sufficient = { glucosa_ayuno: true, glucosa_postprandial: false, presion_arterial: true };

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

  it('aborta al alcanzar el timeout y devuelve el resultado vacío', async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | null | undefined;
      const fetchImpl: typeof fetch = async (_url, init) => {
        observedSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      };
      const pending = requestMlPrediction({}, { endpointUrl: 'https://modelo.example/predict', timeoutMs: 50, fetchImpl });
      await vi.advanceTimersByTimeAsync(50);
      expect((await pending).probabilidadEmpeoramientoFuturo).toBeNull();
      expect(observedSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un cuerpo JSON inválido tampoco deja escapar excepción', async () => {
    const fetchImpl: typeof fetch = async () => new Response('no es JSON', { status: 200 });
    const result = await requestMlPrediction({}, { endpointUrl: 'https://modelo.example/predict', fetchImpl });
    expect(result.probabilidadEmpeoramientoFuturo).toBeNull();
  });
});

describe('parseMlResponse — validación defensiva de forma', () => {
  it('ya NO expone nivel_riesgo_actual ni alerta_roja aunque el endpoint los mande (contrato viejo/error de otro lado)', () => {
    const result = parseMlResponse({
      nivel_riesgo_actual: 'alto',
      alerta_roja: true,
      probabilidad_empeoramiento_futuro: 0.5,
      datos_suficientes: sufficient,
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

  it('no publica probabilidad si falta suficiencia aunque el número sea válido', () => {
    expect(parseMlResponse({ probabilidad_empeoramiento_futuro: 0.8 })).toEqual({
      probabilidadEmpeoramientoFuturo: null, modelVersion: null, datosSuficientes: null,
    });
  });

  it.each([NaN, Infinity, -0.1, 1.01, null, '0.8'])(
    'descarta todo el resultado con probabilidad inválida (%s)', (probability) => {
      expect(parseMlResponse({ probabilidad_empeoramiento_futuro: probability, datos_suficientes: sufficient }).datosSuficientes).toBeNull();
    },
  );

  it.each([0, 1])('acepta una probabilidad límite %s con contrato suficiente', (probability) => {
    const result = parseMlResponse({ probabilidad_empeoramiento_futuro: probability, datos_suficientes: sufficient });
    expect(result.probabilidadEmpeoramientoFuturo).toBe(probability);
    expect(result.modelVersion).toBeNull();
  });

  it('mantiene nullable una versión no informada sin inventar identificación', () => {
    const result = parseMlResponse({ probabilidad_empeoramiento_futuro: 0.8, datos_suficientes: sufficient, model_version: ' ' });
    expect(result.modelVersion).toBeNull();
    expect(result.probabilidadEmpeoramientoFuturo).toBe(0.8);
  });

  it('oculta allfalse como política provisional de Kuni', () => {
    const result = parseMlResponse({ probabilidad_empeoramiento_futuro: 0.8, datos_suficientes: {
      glucosa_ayuno: false, glucosa_postprandial: false, presion_arterial: false,
    } });
    expect(result.probabilidadEmpeoramientoFuturo).toBeNull();
  });
});
