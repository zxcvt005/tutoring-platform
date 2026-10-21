/**
 * Запуск TS-скрипта через локальный tsx или npx.
 * Нужен в контейнере Timeweb, где tsx не входит в production-зависимости.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const script = process.argv[2];
if (!script) {
  console.error("Usage: node scripts/run-with-tsx.mjs <script.ts>");
  process.exit(1);
}

const extra = process.argv.slice(3);
const require = createRequire(import.meta.url);

function run(command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
  child.on("error", (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

try {
  const tsxCli = require.resolve("tsx/cli");
  run(process.execPath, [tsxCli, script, ...extra]);
} catch {
  console.log("tsx не найден в node_modules — пробую npx --yes tsx …");
  run("npx", ["--yes", "tsx", script, ...extra]);
}
