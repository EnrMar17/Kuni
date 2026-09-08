import { spawnSync } from "node:child_process";

const npm = process.env.npm_execpath;
if (!npm) throw new Error("Ejecuta esta verificación con npm run verify.");
for (const args of [
  ["test"], ["--prefix", "domain-core", "test"],
  ["run", "typecheck"], ["--prefix", "domain-core", "run", "typecheck"],
  ["run", "lint"], ["run", "build"],
]) {
  const result = spawnSync(process.execPath, [npm, ...args], { stdio: "inherit", env: { ...process.env, TZ: "UTC" } });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
