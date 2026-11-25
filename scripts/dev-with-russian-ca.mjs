#!/usr/bin/env node
/**
 * next dev с NODE_EXTRA_CA_CERTS (сертификаты Минцифры для API Точки).
 * Аргументы после `--` передаются в next, например:
 *   node scripts/dev-with-russian-ca.mjs -- -H 0.0.0.0 -p 43127
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

const dash = process.argv.indexOf("--");
const extraArgs = dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);

const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
const child = spawn(
  process.execPath,
  [nextBin, "dev", "--webpack", ...extraArgs],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: bundle,
    },
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
