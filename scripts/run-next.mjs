import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// Documentación C: UTC en el proceso Node para paridad con las RPC SQL.
// Las horas clínicas siguen convirtiéndose con la zona de cada unidad.
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, TZ: "UTC" },
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
