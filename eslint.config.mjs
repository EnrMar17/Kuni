import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local assistant scratch files are not application source or versioned.
    ".codex/**",
    ".claude/**",
    // Python virtualenv de ml-service: no es JS/TS, ESLint no debería ni mirarlo.
    "ml-service/.venv/**",
  ]),
]);

export default eslintConfig;
