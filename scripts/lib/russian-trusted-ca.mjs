/**
 * Сертификаты Минцифры (Russian Trusted CA) для TLS к API Точка Банк.
 * Источник скачивания — только официальный: https://www.gosuslugi.ru/crt
 *
 * Приоритет для NODE_EXTRA_CA_CERTS (Production Timeweb):
 * 1) уже заданная валидная переменная окружения;
 * 2) бандл Timeweb App Platform;
 * 3) локальный fallback certs/russian-trusted-ca-bundle.crt.
 *
 * Не класть в public/. Не отключать проверку TLS.
 */
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const GOSUSLUGI_CRT_PAGE = "https://www.gosuslugi.ru/crt";

export const OFFICIAL_CA_URLS = {
  root: "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt",
  sub: "https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt",
};

/** Бандл, который Timeweb App Platform выставляет для Node при включённых CA. */
export const TIMEWEB_NODE_CA_BUNDLE =
  "/usr/local/share/tci_node_ca_bundle.crt";

export const CERTS_DIR_NAME = "certs";
export const ROOT_CA_FILE = "russian_trusted_root_ca_pem.crt";
export const SUB_CA_FILE = "russian_trusted_sub_ca_pem.crt";
export const BUNDLE_FILE = "russian-trusted-ca-bundle.crt";

export function certsDir(cwd = process.cwd()) {
  return path.join(cwd, CERTS_DIR_NAME);
}

export function bundlePath(cwd = process.cwd()) {
  return path.join(certsDir(cwd), BUNDLE_FILE);
}

function countPemCertificates(text) {
  const matches = String(text ?? "").match(/-----BEGIN CERTIFICATE-----/g);
  return matches ? matches.length : 0;
}

function splitPemCertificates(text) {
  return String(text ?? "")
    .split(/(?=-----BEGIN CERTIFICATE-----)/)
    .map((part) => part.trim())
    .filter((part) => part.includes("-----BEGIN CERTIFICATE-----"));
}

function assertPemCertificate(text, label) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    throw new Error(`${label}: пустой файл`);
  }
  if (!trimmed.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error(
      `${label}: ожидался PEM (-----BEGIN CERTIFICATE-----). Источник: ${GOSUSLUGI_CRT_PAGE}`
    );
  }
  if (!trimmed.includes("-----END CERTIFICATE-----")) {
    throw new Error(`${label}: нет -----END CERTIFICATE-----`);
  }
  if (countPemCertificates(trimmed) < 1) {
    throw new Error(`${label}: не найдено PEM-сертификатов`);
  }
  return `${trimmed}\n`;
}

function assertCaBundle(text, label = BUNDLE_FILE) {
  const normalized = assertPemCertificate(text, label);
  const count = countPemCertificates(normalized);
  if (count < 2) {
    throw new Error(
      `${label}: нужны Root + Sub CA (найдено ${count}, ожидается ≥2)`
    );
  }
  return normalized;
}

/**
 * Читает и валидирует CA-бандл: readable + PEM + X509 parse.
 * Не считает файл валидным только из-за существования.
 * @returns {{ ok: true, absolutePath: string, certCount: number } | { ok: false, absolutePath: string | null, certCount: number, error: string }}
 */
export function inspectCaBundleFile(filePath) {
  if (filePath == null || !String(filePath).trim()) {
    return {
      ok: false,
      absolutePath: null,
      certCount: 0,
      error: "пустой путь",
    };
  }

  const absolutePath = path.resolve(String(filePath).trim());
  try {
    fs.accessSync(absolutePath, fs.constants.R_OK);
  } catch {
    return {
      ok: false,
      absolutePath,
      certCount: 0,
      error: "файл недоступен для чтения",
    };
  }

  let text;
  try {
    text = fs.readFileSync(absolutePath, "utf8");
  } catch (err) {
    return {
      ok: false,
      absolutePath,
      certCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!String(text).trim()) {
    return {
      ok: false,
      absolutePath,
      certCount: 0,
      error: "файл пустой",
    };
  }

  const blocks = splitPemCertificates(text);
  if (blocks.length < 1) {
    return {
      ok: false,
      absolutePath,
      certCount: 0,
      error: "нет PEM-блоков -----BEGIN CERTIFICATE-----",
    };
  }

  let parsed = 0;
  for (const block of blocks) {
    try {
      // Разбор через OpenSSL/X509 — отсекает мусор с похожими маркерами.
      void new X509Certificate(block);
      parsed += 1;
    } catch {
      /* skip unparsable block */
    }
  }

  if (parsed < 1) {
    return {
      ok: false,
      absolutePath,
      certCount: 0,
      error: "PEM не разбирается как X509Certificate",
    };
  }

  return { ok: true, absolutePath, certCount: parsed };
}

/**
 * Атомарная запись: сначала temp рядом с целью, затем rename.
 * На Windows rename поверх существующего файла может упасть — тогда replace через unlink.
 */
function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    fs.writeFileSync(tmpPath, content, "utf8");
    try {
      fs.renameSync(tmpPath, filePath);
    } catch {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fs.renameSync(tmpPath, filePath);
    }
  } finally {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }
}

function readExistingValidBundle(outFile) {
  const inspected = inspectCaBundleFile(outFile);
  if (!inspected.ok || inspected.certCount < 2) return null;
  return inspected.absolutePath;
}

async function downloadPem(url, label) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { Accept: "application/x-x509-ca-cert,application/pkix-cert,*/*" },
  });
  if (!res.ok) {
    throw new Error(
      `Не удалось скачать ${label}: HTTP ${res.status} (${url}). Скачайте вручную с ${GOSUSLUGI_CRT_PAGE}`
    );
  }
  const text = await res.text();
  return assertPemCertificate(text, label);
}

/**
 * Скачивает Root + Sub CA с gu-st.ru и собирает PEM-бандл для локального fallback.
 * @returns {Promise<string>} абсолютный путь к бандлу
 */
export async function ensureRussianTrustedCaBundle(cwd = process.cwd()) {
  const dir = certsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, BUNDLE_FILE);
  const existingValid = readExistingValidBundle(outFile);

  try {
    const rootPem = await downloadPem(
      OFFICIAL_CA_URLS.root,
      "Russian Trusted Root CA"
    );
    const subPem = await downloadPem(
      OFFICIAL_CA_URLS.sub,
      "Russian Trusted Sub CA"
    );
    const bundlePem = assertCaBundle(`${rootPem}${subPem}`, BUNDLE_FILE);

    atomicWriteFile(path.join(dir, ROOT_CA_FILE), rootPem);
    atomicWriteFile(path.join(dir, SUB_CA_FILE), subPem);
    atomicWriteFile(outFile, bundlePem);

    return path.resolve(outFile);
  } catch (err) {
    if (existingValid) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `Russian Trusted CA: download/update failed (${reason}); using existing ${existingValid}`
      );
      return existingValid;
    }
    throw err;
  }
}

/** Проверяет, что локальный бандл проекта на диске валиден. */
export function assertBundleReady(cwd = process.cwd()) {
  const file = bundlePath(cwd);
  const inspected = inspectCaBundleFile(file);
  if (!inspected.ok || inspected.certCount < 2) {
    throw new Error(
      inspected.error
        ? `Бандл ${file}: ${inspected.error}. Запустите: npm run certs:russian-trusted`
        : `Нет бандла ${file}. Запустите: npm run certs:russian-trusted`
    );
  }
  return inspected.absolutePath;
}

/**
 * @typedef {'env' | 'timeweb' | 'local-fallback'} CaBundleSource
 * @typedef {{
 *   path: string,
 *   source: CaBundleSource,
 *   certCount: number,
 * }} ResolvedCaBundle
 */

function logCaSelection(log, selection) {
  log(
    `[ca] source=${selection.source} path=${selection.path} certs=${selection.certCount} ok=true`
  );
}

/**
 * Выбор NODE_EXTRA_CA_CERTS без перезаписи рабочего Timeweb/env бандла.
 *
 * Приоритет:
 * 1) валидный NODE_EXTRA_CA_CERTS из env;
 * 2) /usr/local/share/tci_node_ca_bundle.crt (Timeweb);
 * 3) локальный certs/russian-trusted-ca-bundle.crt (ensure + validate);
 * 4) ошибка.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   cwd?: string,
 *   timewebPath?: string,
 *   ensureLocal?: (cwd?: string) => Promise<string>,
 *   log?: (...args: unknown[]) => void,
 * }} [options]
 * @returns {Promise<ResolvedCaBundle>}
 */
export async function resolveNodeExtraCaCerts(options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const timewebPath = options.timewebPath ?? TIMEWEB_NODE_CA_BUNDLE;
  const ensureLocal = options.ensureLocal ?? ensureRussianTrustedCaBundle;
  const log = options.log ?? console.log;

  const fromEnv = env.NODE_EXTRA_CA_CERTS?.trim();
  if (fromEnv) {
    const inspected = inspectCaBundleFile(fromEnv);
    if (inspected.ok) {
      const selection = {
        path: inspected.absolutePath,
        source: /** @type {CaBundleSource} */ ("env"),
        certCount: inspected.certCount,
      };
      logCaSelection(log, selection);
      return selection;
    }
    log(
      `[ca] env NODE_EXTRA_CA_CERTS invalid (${inspected.error}); path=${inspected.absolutePath ?? fromEnv}; trying Timeweb`
    );
  }

  const timeweb = inspectCaBundleFile(timewebPath);
  if (timeweb.ok) {
    const selection = {
      path: timeweb.absolutePath,
      source: /** @type {CaBundleSource} */ ("timeweb"),
      certCount: timeweb.certCount,
    };
    logCaSelection(log, selection);
    return selection;
  }
  log(
    `[ca] Timeweb bundle unavailable (${timeweb.error}); path=${timeweb.absolutePath ?? timewebPath}; trying local fallback`
  );

  let localPath;
  try {
    localPath = await ensureLocal(cwd);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Нет валидного CA-бандла для NODE_EXTRA_CA_CERTS. env/Timeweb недоступны; local ensure failed: ${reason}`
    );
  }

  const local = inspectCaBundleFile(localPath);
  if (local.ok) {
    const selection = {
      path: local.absolutePath,
      source: /** @type {CaBundleSource} */ ("local-fallback"),
      certCount: local.certCount,
    };
    logCaSelection(log, selection);
    return selection;
  }

  throw new Error(
    `Нет валидного CA-бандла для NODE_EXTRA_CA_CERTS (env/Timeweb/local). local=${local.absolutePath ?? localPath}: ${local.error}`
  );
}

/**
 * Env для дочернего Next: TLS verification включена, NODE_EXTRA_CA_CERTS задан до старта.
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {string} caBundlePath
 */
export function buildNextProcessEnv(baseEnv, caBundlePath) {
  const { NODE_TLS_REJECT_UNAUTHORIZED: _rejectTls, ...restEnv } = baseEnv;
  if (_rejectTls != null && _rejectTls !== "") {
    console.warn(
      "Ignoring NODE_TLS_REJECT_UNAUTHORIZED: TLS verification must stay enabled"
    );
  }
  return {
    ...restEnv,
    NODE_EXTRA_CA_CERTS: path.resolve(caBundlePath),
  };
}
