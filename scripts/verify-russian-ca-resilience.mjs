#!/usr/bin/env node
/**
 * Локальная проверка устойчивости CA-бандла (не боевой платёж).
 * Запуск: node scripts/verify-russian-ca-resilience.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  BUNDLE_FILE,
  ROOT_CA_FILE,
  SUB_CA_FILE,
  assertBundleReady,
  ensureRussianTrustedCaBundle,
} from "./lib/russian-trusted-ca.mjs";

const cwd = process.cwd();
const dir = path.join(cwd, "certs");
const bundle = path.join(dir, BUNDLE_FILE);
const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
}

function fail(name, err) {
  results.push({ name, ok: false, err: String(err) });
  console.error(`FAIL  ${name}: ${err}`);
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const data = fs.readFileSync(file);
  return { file, data };
}

function restore(snap) {
  if (!snap) return;
  fs.writeFileSync(snap.file, snap.data);
}

// 1) Успешная загрузка / обновление
try {
  const p = await ensureRussianTrustedCaBundle(cwd);
  assertBundleReady(cwd);
  const text = fs.readFileSync(p, "utf8");
  const n = (text.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
  if (n < 2) throw new Error(`bundle cert count=${n}`);
  pass("download+validate builds Root+Sub bundle");
} catch (e) {
  fail("download+validate builds Root+Sub bundle", e);
}

const goodBundle = backup(bundle);
const goodRoot = backup(path.join(dir, ROOT_CA_FILE));
const goodSub = backup(path.join(dir, SUB_CA_FILE));

// 2) Источник недоступен, валидный бандл есть → OK
try {
  const modPath = fileURLToPath(
    new URL("./lib/russian-trusted-ca.mjs", import.meta.url)
  );
  // Подмена fetch через отдельный процесс неудобна; эмулируем «сеть упала»
  // вызовом ensure при битых URL через временный monkeypatch в этом процессе.
  const ca = await import("./lib/russian-trusted-ca.mjs");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("simulated network down");
  };
  try {
    const p = await ca.ensureRussianTrustedCaBundle(cwd);
    if (!fs.existsSync(p)) throw new Error("missing bundle path");
    ca.assertBundleReady(cwd);
    pass("offline + valid bundle still starts (ensure returns existing)");
  } finally {
    globalThis.fetch = originalFetch;
  }
} catch (e) {
  fail("offline + valid bundle still starts (ensure returns existing)", e);
}

// 3) Пустой «скачанный» ответ не затирает рабочий бандл
try {
  const before = fs.readFileSync(bundle);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(calls === 1 ? "" : "not-a-cert", { status: 200 });
  };
  try {
    await ensureRussianTrustedCaBundle(cwd);
    const after = fs.readFileSync(bundle);
    if (!before.equals(after)) {
      throw new Error("working bundle was overwritten by invalid download");
    }
    assertBundleReady(cwd);
    pass("invalid/empty download does not replace working bundle");
  } finally {
    globalThis.fetch = originalFetch;
  }
} catch (e) {
  fail("invalid/empty download does not replace working bundle", e);
  restore(goodBundle);
  restore(goodRoot);
  restore(goodSub);
}

// 4) Нет бандла и сеть недоступна → ошибка
try {
  fs.writeFileSync(bundle + ".keep-test", fs.readFileSync(bundle));
  fs.unlinkSync(bundle);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("simulated network down");
  };
  let threw = false;
  try {
    await ensureRussianTrustedCaBundle(cwd);
  } catch {
    threw = true;
  } finally {
    globalThis.fetch = originalFetch;
    if (fs.existsSync(bundle + ".keep-test")) {
      fs.renameSync(bundle + ".keep-test", bundle);
    } else {
      restore(goodBundle);
    }
  }
  if (!threw) throw new Error("expected ensure to throw without bundle/network");
  pass("missing bundle + offline → ensure throws (start must abort)");
} catch (e) {
  fail("missing bundle + offline → ensure throws (start must abort)", e);
  restore(goodBundle);
}

// 5) Повреждённый бандл + offline → ошибка
try {
  fs.writeFileSync(bundle, "CORRUPT\n", "utf8");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("simulated network down");
  };
  let threw = false;
  try {
    await ensureRussianTrustedCaBundle(cwd);
  } catch {
    threw = true;
  } finally {
    globalThis.fetch = originalFetch;
    restore(goodBundle);
  }
  if (!threw) throw new Error("expected throw on corrupt bundle + offline");
  pass("corrupt bundle + offline → ensure throws");
} catch (e) {
  fail("corrupt bundle + offline → ensure throws", e);
  restore(goodBundle);
}

// 6) package.json start → обёртка
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  if (pkg.scripts.start !== "node scripts/start-with-russian-ca.mjs") {
    throw new Error(`start=${pkg.scripts.start}`);
  }
  if (pkg.scripts.build !== "next build --webpack") {
    throw new Error(`build=${pkg.scripts.build}`);
  }
  if (!String(pkg.scripts.prebuild || "").includes("ensure-russian-trusted-ca")) {
    throw new Error(`prebuild=${pkg.scripts.prebuild}`);
  }
  const startSrc = fs.readFileSync(
    path.join(cwd, "scripts/start-with-russian-ca.mjs"),
    "utf8"
  );
  if (!startSrc.includes("NODE_EXTRA_CA_CERTS")) {
    throw new Error("start wrapper missing NODE_EXTRA_CA_CERTS");
  }
  if (/NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/.test(startSrc)) {
    throw new Error("start wrapper disables TLS");
  }
  pass("npm start wires start-with-russian-ca.mjs (no TLS bypass)");
} catch (e) {
  fail("npm start wires start-with-russian-ca.mjs (no TLS bypass)", e);
}

// 7) Атомарность: после успешного ensure нет .tmp
try {
  await ensureRussianTrustedCaBundle(cwd);
  const leftovers = fs
    .readdirSync(dir)
    .filter((n) => n.includes(".tmp") && n.includes(BUNDLE_FILE));
  if (leftovers.length) throw new Error(`tmp left: ${leftovers.join(",")}`);
  pass("atomic write leaves no bundle tmp files");
} catch (e) {
  fail("atomic write leaves no bundle tmp files", e);
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Resilience: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
