import "server-only";
import { z } from "zod";

/**
 * Variables de servidor. `import "server-only"` garantiza que si algún día
 * alguien importa esto por error desde un Client Component, el build falla
 * en vez de filtrar SUPABASE_SECRET_KEY al navegador.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1, {
    message: "Falta SUPABASE_SECRET_KEY (clave secreta, solo servidor).",
  }),
});

function loadServerEnv() {
  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
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
