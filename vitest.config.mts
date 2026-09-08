import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    // (`npm --prefix domain-core test`): usa Vitest 2.x y PGlite, que no
    // están instalados en la raíz. Aquí solo entran sus pruebas unitarias.
    include: ["tests/**/*.test.ts", "domain-core/tests/unit/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
  },
});
