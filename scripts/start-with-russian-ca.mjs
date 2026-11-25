#!/usr/bin/env node
/**
 * Production start для Timeweb App Platform / npm start:
 * 1) обеспечивает бандл сертификатов Минцифры;
 * 2) запускает next start с NODE_EXTRA_CA_CERTS (читается только при старте Node).
 *
 * Не отключает TLS. Не задаёт NODE_TLS_REJECT_UNAUTHORIZED.
 */
import { spawn } from "node:child_process";
import path from "node:path";

import {
  assertBundleReady,
  ensureRussianTrustedCaBundle,
} from "./lib/russian-trusted-ca.mjs";

const cwd = process.cwd();
await ensureRussianTrustedCaBundle(cwd);
const bundle = assertBundleReady(cwd);

const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
const { NODE_TLS_REJECT_UNAUTHORIZED: _rejectTls, ...restEnv } = process.env;
if (_rejectTls != null && _rejectTls !== "") {
  console.warn(
    "Ignoring NODE_TLS_REJECT_UNAUTHORIZED: TLS verification must stay enabled"
  );
}

const child = spawn(process.execPath, [nextBin, "start", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...restEnv,
    NODE_EXTRA_CA_CERTS: bundle,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
