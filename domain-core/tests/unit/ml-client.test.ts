import { describe, expect, it, vi } from 'vitest';
import { parseMlResponse, requestMlPrediction, type MlFeatureVector } from '../../src/lib/ml/client';

const sufficient = { glucosa_ayuno: true, glucosa_postprandial: false, presion_arterial: true };

/** Vector mínimo válido; el contenido no importa para estas pruebas, la forma sí. */
const features: MlFeatureVector = {
  age_at_wx: 58,
  diabetes_dx: 1,
  hypertension_dx: 1,
  comorbido_dm_has: 1,
  fn_ta_systolic_mean: 148,
  fn_ta_diastolic_mean: 94,
  tendencia_sistolica: 2.3,
  tendencia_diastolica: 0.8,
  pa_empeorando: 1,
  in_glucose_mean: 165,
  tendencia_glucosa: 4.1,
  glucosa_empeorando: 1,
  adherencia_antidiabeticos: 0.35,
  adherencia_antihipertensivos: 0.4,
  num_complicaciones_dm: 0,
  tiene_complicacion_dm: 0,
  complicacion_grave_dm: 0,
  datos_suficientes: sufficient,
};

/** Respuesta real del servicio: sobre `{data, error}`. */
function ok(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ data: payload, error: null }), { status: 200 });
}

describe('requestMlPrediction — regla de oro: nunca tumba el dashboard', () => {
  it('sin endpointUrl no llama a la red y devuelve unavailable', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error('no debería llamarse');
    }) as unknown as typeof fetch;

    const result = await requestMlPrediction(features, { endpointUrl: null, fetchImpl });
    expect(called).toBe(false);
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('unavailable si el fetch lanza (red caída)', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await requestMlPrediction(features, { endpointUrl: 'https://modelo.example/predecir-riesgo', fetchImpl });
    expect(result.status).toBe('unavailable');
  });

  it('unavailable si la respuesta HTTP no es ok (401 sin API key, 503 modelo no cargado)', async () => {
    for (const status of [401, 500, 503]) {
      const fetchImpl = (async () => new Response('{}', { status })) as unknown as typeof fetch;
      const result = await requestMlPrediction(features, { endpointUrl: 'https://modelo.example/predecir-riesgo', fetchImpl });
      expect(result.status).toBe('unavailable');
    }
  });

  it('unavailable si el cuerpo no es JSON válido', async () => {
    const fetchImpl = (async () => new Response('no soy json', { status: 200 })) as unknown as typeof fetch;
    const result = await requestMlPrediction(features, { endpointUrl: 'https://modelo.example/predecir-riesgo', fetchImpl });
    expect(result.status).toBe('unavailable');
  });

  it('manda la API key en X-API-Key, que es el header que lee app.py (no Authorization)', async () => {
    let seen: Headers | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = new Headers(init.headers);
      return ok({ probabilidad_descompensacion: 0.4, nivel_predicho: 'moderado', model_version: 'v4', datos_suficientes: sufficient });
    }) as unknown as typeof fetch;

    await requestMlPrediction(features, { endpointUrl: 'https://modelo.example/predecir-riesgo', apiKey: 'secreta', fetchImpl });

    expect(seen?.get('x-api-key')).toBe('secreta');
    expect(seen?.get('authorization')).toBeNull();
  });

  it('respeta el timeout y devuelve unavailable en vez de colgarse', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as unknown as typeof fetch;

      const pending = requestMlPrediction(features, { endpointUrl: 'https://modelo.example/predecir-riesgo', timeoutMs: 50, fetchImpl });
      await vi.advanceTimersByTimeAsync(60);
      expect((await pending).status).toBe('unavailable');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('parseMlResponse — sobre {data, error} del servicio real', () => {
  it('parsea una respuesta normal con probabilidad calibrada', () => {
    const result = parseMlResponse({
      data: {
        probabilidad_descompensacion: 0.388,
        nivel_predicho: 'moderado',
        model_version: 'prediccion_futura_v4_2026-09-08',
        datos_suficientes: sufficient,
      },
      error: null,
    });

    expect(result).toEqual({
      status: 'available',
      probability: 0.388,
      level: 'moderado',
      modelVersion: 'prediccion_futura_v4_2026-09-08',
      sufficiency: { glucosaAyuno: true, glucosaPostprandial: false, presionArterial: true },
    });
  });

  it('acepta también un cuerpo plano, por si el servicio queda detrás de un gateway que desenvuelve', () => {
    const result = parseMlResponse({
      probabilidad_descompensacion: 0.1,
      nivel_predicho: 'bajo',
      model_version: 'v4',
      datos_suficientes: sufficient,
    });
    expect(result.status).toBe('available');
  });

  it('probabilidad cero con contrato válido se conserva como cero, no como ausencia', () => {
    const result = parseMlResponse({
      data: { probabilidad_descompensacion: 0, nivel_predicho: 'bajo', model_version: 'v4', datos_suficientes: sufficient },
      error: null,
    });
    expect(result).toMatchObject({ status: 'available', probability: 0 });
  });

  it('un `error` no nulo no publica nada aunque venga con datos', () => {
    const result = parseMlResponse({
      data: { probabilidad_descompensacion: 0.9, nivel_predicho: 'alto', datos_suficientes: sufficient },
      error: { code: 'VALIDATION', message: 'campo faltante' },
    });
    expect(result).toEqual({ status: 'unavailable' });
  });
});

describe('parseMlResponse — techo de riesgo: probabilidad null NO es ausencia de datos', () => {
  const ceiling = {
    data: {
      probabilidad_descompensacion: null,
      nivel_predicho: 'alto',
      model_version: 'prediccion_futura_v4_2026-09-08',
      datos_suficientes: sufficient,
      mensaje: '⚠️ Riesgo máximo (presión arterial en nivel de crisis). Este paciente ya está en el peor escenario clínico posible.',
    },
    error: null,
  };

  it('se distingue de unavailable y conserva nivel alto y el motivo', () => {
    const result = parseMlResponse(ceiling);
    expect(result.status).toBe('ceiling');
    expect(result).toMatchObject({ probability: null, level: 'alto' });
    if (result.status === 'ceiling') {
      expect(result.message).toContain('presión arterial en nivel de crisis');
    }
  });

  it('probabilidad null SIN mensaje no se publica: no se inventa un techo', () => {
    const sinMensaje = { data: { ...ceiling.data, mensaje: undefined }, error: null };
    expect(parseMlResponse(sinMensaje)).toEqual({ status: 'unavailable' });
  });

  it('un mensaje vacío tampoco acredita techo', () => {
    const vacio = { data: { ...ceiling.data, mensaje: '   ' }, error: null };
    expect(parseMlResponse(vacio)).toEqual({ status: 'unavailable' });
  });
});

describe('parseMlResponse — validación defensiva de forma', () => {
  it('nunca lanza con entradas malformadas', () => {
    for (const bad of [null, undefined, 'texto plano', [], 42, true]) {
      expect(() => parseMlResponse(bad)).not.toThrow();
      expect(parseMlResponse(bad)).toEqual({ status: 'unavailable' });
    }
  });

  it('rechaza un nivel_predicho fuera del enum del servicio', () => {
    const result = parseMlResponse({
      data: { probabilidad_descompensacion: 0.5, nivel_predicho: 'altísimo', datos_suficientes: sufficient },
      error: null,
    });
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('sin nivel_predicho no se publica una probabilidad suelta', () => {
    expect(parseMlResponse({ data: { probabilidad_descompensacion: 0.5, datos_suficientes: sufficient }, error: null })).toEqual({
      status: 'unavailable',
    });
  });

  it('rechaza probabilidades fuera de [0,1] y no finitas', () => {
    for (const probability of [1.5, -0.1, Number.NaN, Number.POSITIVE_INFINITY, '0.5']) {
      const result = parseMlResponse({
        data: { probabilidad_descompensacion: probability, nivel_predicho: 'alto', datos_suficientes: sufficient },
        error: null,
      });
      expect(result).toEqual({ status: 'unavailable' });
    }
  });

  it('exige los tres booleanos de suficiencia completos', () => {
    const parcial = parseMlResponse({
      data: { probabilidad_descompensacion: 0.5, nivel_predicho: 'moderado', datos_suficientes: { glucosa_ayuno: true } },
      error: null,
    });
    expect(parcial).toEqual({ status: 'unavailable' });

    const conTipoMalo = parseMlResponse({
      data: {
        probabilidad_descompensacion: 0.5,
        nivel_predicho: 'moderado',
        datos_suficientes: { glucosa_ayuno: 'si', glucosa_postprandial: true, presion_arterial: true },
      },
      error: null,
    });
    expect(conTipoMalo).toEqual({ status: 'unavailable' });
  });

  it('política provisional de Kuni: con las tres variables insuficientes no se publica nada', () => {
    const result = parseMlResponse({
      data: {
        probabilidad_descompensacion: 0.9,
        nivel_predicho: 'alto',
        datos_suficientes: { glucosa_ayuno: false, glucosa_postprandial: false, presion_arterial: false },
      },
      error: null,
    });
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('una versión ausente o en blanco queda null, nunca se inventa', () => {
    const sinVersion = parseMlResponse({
      data: { probabilidad_descompensacion: 0.8, nivel_predicho: 'alto', model_version: '  ', datos_suficientes: sufficient },
      error: null,
    });
    expect(sinVersion).toMatchObject({ status: 'available', modelVersion: null });
  });

  it('no expone riesgo actual ni alertas del modelo aunque el servicio los mandara', () => {
    const result = parseMlResponse({
      data: {
        nivel_riesgo_actual: 'alto',
        alerta_roja: true,
        probabilidad_descompensacion: 0.5,
        nivel_predicho: 'moderado',
        datos_suficientes: sufficient,
      },
      error: null,
    });
    expect(result).not.toHaveProperty('nivel_riesgo_actual');
    expect(result).not.toHaveProperty('alerta_roja');
  });
});
