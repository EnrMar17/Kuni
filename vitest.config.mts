import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

process.env.TZ = "UTC";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // La suite de integración SQL de C (`domain-core/tests/integration`)
    // corre con el runner y las dependencias de su propio paquete
    // (`npm --prefix domain-core test`): PGlite vive en ese paquete.
    // Ambos runners usan Vitest 5; aquí solo entran sus pruebas unitarias.
    include: ["tests/**/*.test.ts", "domain-core/tests/unit/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
  },
});
