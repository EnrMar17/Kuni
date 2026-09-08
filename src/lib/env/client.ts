import { z } from "zod";

/**
 * Únicamente variables NEXT_PUBLIC_* — este módulo puede importarse desde
 * Client Components, así que nunca debe tocar SUPABASE_SECRET_KEY ni nada
 * de servidor. Validar aquí evita el típico "undefined" silencioso si falta
 * una variable en el hosting.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: "NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida (https://...supabase.co).",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, {
    message: "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  }),
});

function loadClientEnv() {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variables de entorno públicas inválidas:\n${detail}`);
  }

  return parsed.data;
}

export const clientEnv = loadClientEnv();
