#!/usr/bin/env node
/**
 * Production start для Timeweb App Platform / npm start:
 * 1) выбирает валидный CA-бандл (env → Timeweb → local fallback);
 * 2) запускает next start с NODE_EXTRA_CA_CERTS (читается только при старте Node).
 *
 * Не отключает TLS. Не задаёт NODE_TLS_REJECT_UNAUTHORIZED.
 * Не перезаписывает рабочий NODE_EXTRA_CA_CERTS / бандл Timeweb.
 */
import { spawn } from "node:child_process";
import path from "node:path";

import {
  buildNextProcessEnv,
  resolveNodeExtraCaCerts,
} from "./lib/russian-trusted-ca.mjs";

const cwd = process.cwd();
const selection = await resolveNodeExtraCaCerts({ cwd });

const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
const child = spawn(
  process.execPath,
  [nextBin, "start", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: buildNextProcessEnv(process.env, selection.path),
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
