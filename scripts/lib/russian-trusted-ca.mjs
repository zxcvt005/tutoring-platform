/**
 * Сертификаты Минцифры (Russian Trusted CA) для TLS к API Точка Банк.
 * Источник только официальный: https://www.gosuslugi.ru/crt
 * Прямые ссылки из инструкции Точки: https://developers.tochka.com/docs/tochka-api/certificate
 *
 * Не класть в public/. Не отключать проверку TLS.
 */
import fs from "node:fs";
import path from "node:path";

export const GOSUSLUGI_CRT_PAGE = "https://www.gosuslugi.ru/crt";

export const OFFICIAL_CA_URLS = {
  root: "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt",
  sub: "https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt",
};

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
  if (!fs.existsSync(outFile)) return null;
  try {
    assertCaBundle(fs.readFileSync(outFile, "utf8"), BUNDLE_FILE);
    return path.resolve(outFile);
  } catch {
    return null;
  }
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
 * Скачивает Root + Sub CA с gu-st.ru и собирает PEM-бандл для NODE_EXTRA_CA_CERTS.
 * Замена файлов только после успешной загрузки и проверки обоих PEM (атомарно).
 * Если сеть недоступна — использует уже лежащий валидный бандл; иначе бросает ошибку.
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

    // Пишем только после полной проверки в памяти — пустой/частичный ответ не затрёт рабочий бандл.
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

/** Проверяет, что бандл на диске валиден (Root + Sub). */
export function assertBundleReady(cwd = process.cwd()) {
  const file = bundlePath(cwd);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Нет бандла ${file}. Запустите: npm run certs:russian-trusted`
    );
  }
  assertCaBundle(fs.readFileSync(file, "utf8"), BUNDLE_FILE);
  return path.resolve(file);
}
