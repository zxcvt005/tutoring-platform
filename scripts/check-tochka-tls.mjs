#!/usr/bin/env node
/**
 * Проверка TLS к тестовому домену Точки до обращения к боевому API.
 * Ожидаемый ответ: {"status":"ok"}
 *
 *   npm run test:tochka-tls
 *
 * NODE_EXTRA_CA_CERTS читается Node только при старте процесса — при необходимости
 * скрипт перезапускает себя с уже выставленной переменной.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertBundleReady,
  ensureRussianTrustedCaBundle,
} from "./lib/russian-trusted-ca.mjs";

const TLS_TEST_URL = "https://tls-test.tochka.com/api";
const selfPath = fileURLToPath(import.meta.url);

const refresh = process.argv.includes("--refresh");
const bundle = refresh
  ? await ensureRussianTrustedCaBundle()
  : (() => {
      try {
        return assertBundleReady();
      } catch {
        return null;
      }
    })() ?? (await ensureRussianTrustedCaBundle());

const resolvedBundle = path.resolve(bundle);
const currentExtra = process.env.NODE_EXTRA_CA_CERTS
  ? path.resolve(process.env.NODE_EXTRA_CA_CERTS)
  : "";

if (currentExtra !== resolvedBundle) {
  const child = spawn(
    process.execPath,
    [selfPath, ...process.argv.slice(2).filter((a) => a !== "--refresh")],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: resolvedBundle,
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
} else {
  console.log(`NODE_EXTRA_CA_CERTS=${process.env.NODE_EXTRA_CA_CERTS}`);
  console.log(`GET ${TLS_TEST_URL}`);

  try {
    const res = await fetch(TLS_TEST_URL, {
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    console.log(`HTTP ${res.status}`);
    console.log(text);
    if (!res.ok) process.exit(1);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("Ответ не JSON");
      process.exit(1);
    }
    if (parsed?.status !== "ok") {
      console.error('Ожидался {"status":"ok"}');
      process.exit(1);
    }
    console.log("TLS OK: сертификаты Минцифры принимаются Node.js");
  } catch (err) {
    const cause = err instanceof Error ? err.cause : null;
    const code =
      (cause && typeof cause === "object" && "code" in cause && cause.code) ||
      (err instanceof Error && "code" in err && err.code) ||
      "";
    const message = err instanceof Error ? err.message : String(err);
    console.error("TLS FAIL:", code || message);
    if (cause instanceof Error && cause.message) {
      console.error(cause.message);
    }
    process.exit(1);
  }
}
