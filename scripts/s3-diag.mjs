/**
 * Одноразовая диагностика S3 для Production-контейнера Timeweb.
 *
 * НЕ печатает Access Key / Secret Key.
 * НЕ меняет env.
 * По умолчанию только HeadBucket (чтение метаданных бакета).
 * Опциональный write-probe создаёт и сразу удаляет временный объект
 * под префиксом `__diag/` — пользовательские ключи не трогает.
 *
 * Запуск в /app контейнера (env уже из панели Timeweb):
 *   node scripts/s3-diag.mjs
 *   node scripts/s3-diag.mjs --write-probe
 *
 * Локально (читает .env.local / .env, не перезаписывая уже заданные):
 *   node scripts/s3-diag.mjs
 *
 * Важно: приложение НЕ использует AWS SDK — только SigV4 + fetch
 * (`src/server/media/s3.ts`). Этот скрипт повторяет ту же схему подписи
 * и path-style URL, что и production-код.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDate(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeKey(key) {
  return key
    .split("/")
    .map((part) => encodeRfc3986(part))
    .join("/");
}

function signingKey(secret, dateStamp, region) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function normalizeS3Endpoint(raw) {
  const url = new URL(raw.trim());
  const discardedPathSegments = url.pathname
    .split("/")
    .filter((part) => part.length > 0).length;
  return { origin: url.origin, discardedPathSegments };
}

function parseS3ErrorBody(body, status) {
  const code =
    body.match(/<Code>\s*([^<]+?)\s*<\/Code>/i)?.[1]?.trim() ||
    (status === 404 ? "HTTP_404" : `HTTP_${status}`);
  const message =
    body.match(/<Message>\s*([^<]+?)\s*<\/Message>/i)?.[1]?.trim() || "";
  return { status, code, message };
}

function maskPresent(value) {
  if (!value) return { present: false, length: 0 };
  return { present: true, length: value.length };
}

function readConfig() {
  const endpointRaw = process.env.S3_ENDPOINT?.trim() || "";
  const bucket = process.env.S3_BUCKET?.trim() || "";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || "";
  const region = process.env.S3_REGION?.trim() || "ru-1";
  const forceRaw = process.env.S3_FORCE_PATH_STYLE?.trim().toLowerCase();
  // Как в chat-storage.ts: path-style по умолчанию; выключается только "0"/"false".
  const forcePathStyle = !(forceRaw === "0" || forceRaw === "false");
  const forceEnvRaw = process.env.S3_FORCE_PATH_STYLE ?? "";
  return {
    endpointRaw,
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    forcePathStyle,
    forceEnvRaw,
    forceRaw,
  };
}

function buildObjectTarget(config, key) {
  const { origin } = normalizeS3Endpoint(config.endpoint);
  const endpoint = new URL(origin);
  if (config.forcePathStyle) {
    const canonicalPath = `/${encodeRfc3986(config.bucket)}/${encodeKey(key)}`;
    const url = new URL(`${endpoint.origin}${canonicalPath}`);
    return { url, canonicalPath, host: url.host, forcePathStyle: true };
  }
  const url = new URL(
    `${endpoint.protocol}//${config.bucket}.${endpoint.host}/${encodeKey(key)}`
  );
  return {
    url,
    canonicalPath: `/${encodeKey(key)}`,
    host: url.host,
    forcePathStyle: false,
  };
}

function buildBucketTarget(config) {
  const { origin } = normalizeS3Endpoint(config.endpoint);
  const endpoint = new URL(origin);
  if (config.forcePathStyle) {
    const canonicalPath = `/${encodeRfc3986(config.bucket)}`;
    const url = new URL(`${endpoint.origin}${canonicalPath}`);
    return { url, canonicalPath, host: url.host, forcePathStyle: true };
  }
  const url = new URL(`${endpoint.protocol}//${config.bucket}.${endpoint.host}/`);
  return {
    url,
    canonicalPath: "/",
    host: url.host,
    forcePathStyle: false,
  };
}

async function signedRequest(config, method, target, body, extraHeaders = {}) {
  const now = amzDate();
  const dateStamp = now.slice(0, 8);
  const payloadHash = body ? sha256Hex(body) : sha256Hex("");
  const headers = {
    host: target.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": now,
    ...extraHeaders,
  };
  const signedHeaderNames = Object.keys(headers)
    .map((n) => n.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map((n) => `${n}:${headers[n].trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    target.canonicalPath,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    now,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(config.secretAccessKey, dateStamp, config.region)
  )
    .update(stringToSign, "utf8")
    .digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(target.url, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
  return res;
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const writeProbe = process.argv.includes("--write-probe");
  const cfg = readConfig();

  printSection("1. Presence of env vars (secrets never printed)");
  const required = [
    ["S3_ENDPOINT", cfg.endpointRaw],
    ["S3_BUCKET", cfg.bucket],
    ["S3_ACCESS_KEY_ID", cfg.accessKeyId],
    ["S3_SECRET_ACCESS_KEY", cfg.secretAccessKey],
  ];
  let missing = false;
  for (const [name, value] of required) {
    const info = maskPresent(value);
    console.log(
      `${name}: present=${info.present} length=${info.length}`
    );
    if (!info.present) missing = true;
  }
  console.log(
    `S3_REGION: ${cfg.region}${process.env.S3_REGION?.trim() ? "" : " (default, env unset)"}`
  );
  console.log(
    `S3_FORCE_PATH_STYLE raw=${JSON.stringify(cfg.forceEnvRaw)} → forcePathStyle=${cfg.forcePathStyle}`
  );
  console.log(
    `CHAT_STORAGE_DRIVER=${JSON.stringify(process.env.CHAT_STORAGE_DRIVER ?? "")}`
  );
  console.log(`NODE_ENV=${JSON.stringify(process.env.NODE_ENV ?? "")}`);

  if (missing) {
    console.error(
      "\nFAIL: missing required S3 env. Fix panel variables, then re-run."
    );
    process.exit(2);
  }

  const { origin, discardedPathSegments } = normalizeS3Endpoint(cfg.endpointRaw);
  const runtime = {
    endpoint: origin,
    region: cfg.region,
    bucket: cfg.bucket,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    forcePathStyle: cfg.forcePathStyle,
  };

  printSection("2. Non-secret config (as the app would use)");
  console.log(`S3_ENDPOINT (raw)=${cfg.endpointRaw}`);
  console.log(`S3_ENDPOINT (normalized origin)=${origin}`);
  console.log(`endpointPathSegmentsDiscarded=${discardedPathSegments}`);
  console.log(`S3_REGION=${runtime.region}`);
  console.log(`S3_BUCKET=${runtime.bucket}`);
  console.log(`S3_BUCKET length=${runtime.bucket.length}`);
  console.log(
    `S3_BUCKET looksLikePath=${runtime.bucket.includes("/")}`
  );
  console.log(`S3_FORCE_PATH_STYLE effective=${runtime.forcePathStyle}`);
  if (discardedPathSegments > 0) {
    console.warn(
      "WARN: S3_ENDPOINT contains a path; app uses origin only. Bucket must be in S3_BUCKET."
    );
  }

  const sampleKey = "questions/diag/sample.png";
  const objectTarget = buildObjectTarget(runtime, sampleKey);
  const bucketTarget = buildBucketTarget(runtime);

  printSection("3. Request shape (no secrets)");
  console.log(`addressing=${runtime.forcePathStyle ? "path-style" : "virtual-hosted"}`);
  console.log(`HeadBucket URL=${bucketTarget.url.toString()}`);
  console.log(`HeadBucket canonicalPath=${bucketTarget.canonicalPath}`);
  console.log(`HeadBucket host=${bucketTarget.host}`);
  console.log(`Example PutObject URL=${objectTarget.url.toString()}`);
  console.log(`Example PutObject canonicalPath=${objectTarget.canonicalPath}`);
  console.log(`SigV4 region scope=${runtime.region}`);
  console.log(
    `AccessKey fingerprint: length=${runtime.accessKeyId.length} prefix=${runtime.accessKeyId.slice(0, 4)}…`
  );

  printSection("4. HeadBucket");
  let headInfo;
  try {
    const headRes = await signedRequest(runtime, "HEAD", bucketTarget);
    const headBody = await headRes.text().catch(() => "");
    headInfo = parseS3ErrorBody(headBody, headRes.status);
    // HEAD often has empty body; keep status/code from parser defaults.
    if (!headBody && headRes.ok) {
      headInfo = { status: headRes.status, code: "OK", message: "" };
    } else if (!headBody && !headRes.ok) {
      headInfo = {
        status: headRes.status,
        code: headRes.status === 404 ? "HTTP_404" : `HTTP_${headRes.status}`,
        message: "(empty body)",
      };
    }
    console.log(`HTTP status=${headInfo.status}`);
    console.log(`S3 code=${headInfo.code}`);
    if (headInfo.message) console.log(`S3 message=${headInfo.message}`);
  } catch (err) {
    console.error("HeadBucket transport error:", err instanceof Error ? err.message : err);
    process.exit(3);
  }

  const headOk = headInfo.status >= 200 && headInfo.status < 300;
  if (!headOk) {
    printSection("Interpretation (HeadBucket failed)");
    const code = String(headInfo.code || "").toLowerCase();
    if (code === "nosuchbucket" || headInfo.status === 404) {
      console.log(
        "Likely: bucket name wrong/missing, or endpoint points to a different storage, or path-style/host mismatch."
      );
      console.log(
        "Compare S3_BUCKET character-for-character with the full bucket name in Timeweb → Object Storage."
      );
    } else if (code === "accessdenied" || headInfo.status === 403) {
      console.log(
        "Bucket probably exists, but this access key cannot access it (wrong user / no rights)."
      );
    } else if (
      code === "invalidaccesskeyid" ||
      code === "signaturedoesnotmatch"
    ) {
      console.log(
        "Credentials/region/signing mismatch. Check Access Key, Secret, S3_REGION=ru-1."
      );
    } else if (code.includes("redirect")) {
      console.log("Wrong endpoint/region for this bucket.");
    } else {
      console.log("Unexpected HeadBucket failure — send this output (still no secrets).");
    }
    console.log(
      "\nWrite-probe skipped because HeadBucket did not succeed."
    );
    process.exit(1);
  }

  console.log("HeadBucket OK — bucket is reachable with current credentials.");

  if (!writeProbe) {
    printSection("5. Next optional step");
    console.log(
      "To also verify PutObject+DeleteObject of a temporary __diag/ object:"
    );
    console.log("  node scripts/s3-diag.mjs --write-probe");
    process.exit(0);
  }

  printSection("5. Write probe (temporary object under __diag/)");
  const probeKey = `__diag/s3-diag-${Date.now()}-${randomBytes(4).toString("hex")}.txt`;
  // App object keys normally require chats|questions|… prefix; probe bypasses
  // that app-level guard and talks to S3 directly with the same signer.
  const probeTarget = buildObjectTarget(runtime, probeKey);
  const payload = Buffer.from(`s3-diag probe ${new Date().toISOString()}\n`, "utf8");
  console.log(`probe key=${probeKey}`);
  console.log(`probe URL=${probeTarget.url.toString()}`);

  try {
    const putRes = await signedRequest(runtime, "PUT", probeTarget, payload, {
      "content-type": "text/plain",
    });
    const putBody = await putRes.text().catch(() => "");
    const putInfo = putRes.ok
      ? { status: putRes.status, code: "OK", message: "" }
      : parseS3ErrorBody(putBody, putRes.status);
    console.log(`PutObject HTTP status=${putInfo.status} code=${putInfo.code}`);
    if (!putRes.ok) {
      if (putInfo.message) console.log(`PutObject message=${putInfo.message}`);
      process.exit(1);
    }
  } catch (err) {
    console.error("PutObject transport error:", err instanceof Error ? err.message : err);
    process.exit(3);
  }

  try {
    const delRes = await signedRequest(runtime, "DELETE", probeTarget);
    const delBody = await delRes.text().catch(() => "");
    const delInfo =
      delRes.ok || delRes.status === 204 || delRes.status === 404
        ? { status: delRes.status, code: "OK", message: "" }
        : parseS3ErrorBody(delBody, delRes.status);
    console.log(
      `DeleteObject HTTP status=${delInfo.status} code=${delInfo.code}`
    );
    if (!(delRes.ok || delRes.status === 204 || delRes.status === 404)) {
      console.warn(
        "WARN: probe object may remain; delete manually key starting with __diag/s3-diag-"
      );
      process.exit(1);
    }
  } catch (err) {
    console.error("DeleteObject transport error:", err instanceof Error ? err.message : err);
    console.warn("WARN: probe object may remain under __diag/");
    process.exit(3);
  }

  printSection("Result");
  console.log("HeadBucket + PutObject + DeleteObject succeeded with app-equivalent signing.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
