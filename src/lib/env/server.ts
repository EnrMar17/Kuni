import "server-only";
import { z } from "zod";

/**
 * Variables de servidor. `import "server-only"` garantiza que si algún día
 * alguien importa esto por error desde un Client Component, el build falla
 * en vez de filtrar SUPABASE_SECRET_KEY al navegador.
 */
const serverEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1, {
      message: "Falta SUPABASE_SECRET_KEY (clave secreta, solo servidor).",
    }),
    // Selector histórico de WhatsApp. Sigue siendo el fallback para no romper
    // despliegues existentes; MESSAGE_PROVIDER permite sumar SMS sin renombrar
    // variables ya instaladas.
    WHATSAPP_PROVIDER: z.enum(["mock", "twilio", "meta"]).default("mock"),
    MESSAGE_PROVIDER: z.enum(["mock", "twilio", "meta", "smsgate"]).optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    // Admite con o sin el prefijo "whatsapp:"; el adaptador lo normaliza.
    TWILIO_WHATSAPP_FROM: z.string().optional(),
    // B5 — Content SIDs de las plantillas aprobadas de Twilio, una por
    // "forma" de mensaje (cada plantilla de WhatsApp tiene texto y variables
    // fijas; no se puede reutilizar una para contenido distinto). Todas
    // opcionales a propósito: sin el SID de un tipo, `send.ts` sigue
    // fallando explícito con `template_not_configured` para ESE tipo en vez
    // de inventar una plantilla o mandar texto libre que WhatsApp rechazaría
    // fuera de la ventana de sesión — activar cada una es tan simple como
    // rellenar la variable una vez que Twilio la aprueba. Ver
    // docs/bitacora-canal-b.md 2026-09-08 (B5) para el texto exacto enviado
    // a revisión.
    TWILIO_MEDICATION_CONTENT_SID: z.string().optional(),
    TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID: z.string().optional(),
    TWILIO_MEASUREMENT_BP_CONTENT_SID: z.string().optional(),
    TWILIO_APPOINTMENT_CONTENT_SID: z.string().optional(),
    TWILIO_NONRESPONSE_CONTENT_SID: z.string().optional(),
    // SMS Gateway for Android (capcom6/android-sms-gateway). La URL puede ser
    // la nube pública, un servidor privado o el servidor local del teléfono.
    SMS_GATEWAY_BASE_URL: z.string().url().optional(),
    SMS_GATEWAY_USERNAME: z.string().optional(),
    SMS_GATEWAY_PASSWORD: z.string().optional(),
    // JWT con alcance mínimo messages:send. Si existe, tiene precedencia sobre
    // Basic Auth; su rotación/expiración se administra fuera de Kuni.
    SMS_GATEWAY_TOKEN: z.string().optional(),
    SMS_GATEWAY_DEVICE_ID: z.string().optional(),
    SMS_GATEWAY_SIM_NUMBER: z.coerce.number().int().min(1).max(3).optional(),
    SMS_GATEWAY_TTL_SECONDS: z.coerce.number().int().min(5).max(86_400).default(3600),
    SMS_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(10_000),
    // URL pública exacta (sin "/" final) que Twilio ve al llamar los
    // webhooks. Debe coincidir con la configurada en el panel de Twilio:
    // la validación de firma recalcula la firma sobre esta URL + los
    // parámetros del POST, y una URL distinta la invalida siempre.
    APP_PUBLIC_URL: z
      .string()
      .url()
      .refine((url) => !url.endsWith("/"), {
        message: "APP_PUBLIC_URL no debe terminar en '/'.",
      })
      .optional(),
    // Token Bearer que protege `api/jobs/tick` — solo el Cron de Supabase
    // (o quien lo invoque manualmente para probar) debe poder dispararlo.
    // Sin valor, ese endpoint rechaza toda request (fail-safe: nunca "sin
    // token = público").
    CRON_SECRET: z.string().min(16, {
      message: "CRON_SECRET debe tener al menos 16 caracteres si se define.",
    }).optional(),
    // Microservicio predictivo del equipo de IA (`app.py`). URL COMPLETA del
    // endpoint, incluyendo la ruta: el servicio expone `/predecir-riesgo`.
    // Ausente = inferencia deshabilitada; el tablero sigue funcionando solo
    // con `evaluateRisk()`. Nunca NEXT_PUBLIC_: el navegador no debe hablarle
    // al modelo ni conocer su llave.
    ML_ENDPOINT_URL: z.string().url().optional(),
    // Viaja en el header `X-API-Key`, que es el que valida el servicio.
    ML_API_KEY: z.string().optional(),
    // Presupuesto de espera por paciente. Corto a propósito: una predicción
    // es un extra, jamás debe retrasar la carga del tablero.
    ML_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2000),
  })
  .superRefine((env, ctx) => {
    const provider = env.MESSAGE_PROVIDER ?? env.WHATSAPP_PROVIDER;
    if (provider === "twilio") {
      const required = {
        TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
        TWILIO_WHATSAPP_FROM: env.TWILIO_WHATSAPP_FROM,
        APP_PUBLIC_URL: env.APP_PUBLIC_URL,
      } as const;
      for (const [key, value] of Object.entries(required)) {
        if (!value) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `Falta ${key}: obligatorio cuando el proveedor efectivo es twilio.`,
          });
        }
      }
    }
    if (provider === "smsgate") {
      if (!env.SMS_GATEWAY_BASE_URL) {
        ctx.addIssue({ code: "custom", path: ["SMS_GATEWAY_BASE_URL"], message: "Falta SMS_GATEWAY_BASE_URL para smsgate." });
      }
      const hasBasicAuth = Boolean(env.SMS_GATEWAY_USERNAME && env.SMS_GATEWAY_PASSWORD);
      if (!env.SMS_GATEWAY_TOKEN && !hasBasicAuth) {
        ctx.addIssue({
          code: "custom",
          path: ["SMS_GATEWAY_TOKEN"],
          message: "Configura SMS_GATEWAY_TOKEN o el par SMS_GATEWAY_USERNAME/SMS_GATEWAY_PASSWORD para smsgate.",
        });
      }
      if (Boolean(env.SMS_GATEWAY_USERNAME) !== Boolean(env.SMS_GATEWAY_PASSWORD)) {
        ctx.addIssue({
          code: "custom",
          path: ["SMS_GATEWAY_USERNAME"],
          message: "SMS_GATEWAY_USERNAME y SMS_GATEWAY_PASSWORD deben configurarse juntos.",
        });
      }
    }
  });

function loadServerEnv() {
  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER,
    MESSAGE_PROVIDER: process.env.MESSAGE_PROVIDER,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_MEDICATION_CONTENT_SID: process.env.TWILIO_MEDICATION_CONTENT_SID,
    TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID: process.env.TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID,
    TWILIO_MEASUREMENT_BP_CONTENT_SID: process.env.TWILIO_MEASUREMENT_BP_CONTENT_SID,
    TWILIO_APPOINTMENT_CONTENT_SID: process.env.TWILIO_APPOINTMENT_CONTENT_SID,
    TWILIO_NONRESPONSE_CONTENT_SID: process.env.TWILIO_NONRESPONSE_CONTENT_SID,
    SMS_GATEWAY_BASE_URL: process.env.SMS_GATEWAY_BASE_URL,
    SMS_GATEWAY_USERNAME: process.env.SMS_GATEWAY_USERNAME,
    SMS_GATEWAY_PASSWORD: process.env.SMS_GATEWAY_PASSWORD,
    SMS_GATEWAY_TOKEN: process.env.SMS_GATEWAY_TOKEN,
    SMS_GATEWAY_DEVICE_ID: process.env.SMS_GATEWAY_DEVICE_ID,
    SMS_GATEWAY_SIM_NUMBER: process.env.SMS_GATEWAY_SIM_NUMBER,
    SMS_GATEWAY_TTL_SECONDS: process.env.SMS_GATEWAY_TTL_SECONDS,
    SMS_GATEWAY_TIMEOUT_MS: process.env.SMS_GATEWAY_TIMEOUT_MS,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    ML_ENDPOINT_URL: process.env.ML_ENDPOINT_URL,
    ML_API_KEY: process.env.ML_API_KEY,
    ML_TIMEOUT_MS: process.env.ML_TIMEOUT_MS,
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variables de entorno de servidor inválidas:\n${detail}`);
  }

  return parsed.data;
}

export const serverEnv = loadServerEnv();
