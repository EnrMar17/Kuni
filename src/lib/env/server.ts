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
    // `mock` es el default seguro: no envía nada real. Cambiar a `twilio`
    // solo cuando las credenciales de abajo estén configuradas. `meta` queda
    // reservado para el adaptador alternativo del plan; aún no implementado.
    WHATSAPP_PROVIDER: z.enum(["mock", "twilio", "meta"]).default("mock"),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    // Admite con o sin el prefijo "whatsapp:"; el adaptador lo normaliza.
    TWILIO_WHATSAPP_FROM: z.string().optional(),
    // Content SID de la plantilla aprobada de Twilio para recordatorios de
    // cita (fuera de la ventana de sesión de 24h). Opcional: sin él, ese
    // tipo de envío queda deshabilitado en vez de fallar el arranque.
    TWILIO_APPOINTMENT_CONTENT_SID: z.string().optional(),
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
  })
  .superRefine((env, ctx) => {
    if (env.WHATSAPP_PROVIDER !== "twilio") return;
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
          message: `Falta ${key}: obligatorio cuando WHATSAPP_PROVIDER=twilio.`,
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
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_APPOINTMENT_CONTENT_SID: process.env.TWILIO_APPOINTMENT_CONTENT_SID,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
    CRON_SECRET: process.env.CRON_SECRET,
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
