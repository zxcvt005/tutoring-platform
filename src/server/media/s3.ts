import { createHash, createHmac } from "node:crypto";

import { serviceUnavailable } from "@/server/errors";

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type S3ObjectTarget = {
  url: URL;
  canonicalPath: string;
  host: string;
  forcePathStyle: boolean;
};

type S3ErrorInfo = {
  status: number;
  code: string;
  message: string;
};

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDate(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((part) => encodeRfc3986(part))
    .join("/");
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

/**
 * S3_ENDPOINT должен быть origin без bucket/path.
 * Частая ошибка: `https://s3.twcstorage.ru/<bucket>` → лишний сегмент и NoSuchBucket.
 */
export function normalizeS3Endpoint(raw: string): {
  origin: string;
  discardedPathSegments: number;
} {
  const url = new URL(raw.trim());
  const discardedPathSegments = url.pathname
    .split("/")
    .filter((part) => part.length > 0).length;
  return { origin: url.origin, discardedPathSegments };
}

/** Собирает URL Put/Get/Delete без секретов — для тестов и диагностики. */
export function buildS3ObjectTarget(
  config: Pick<S3Config, "endpoint" | "bucket" | "forcePathStyle">,
  key: string
): S3ObjectTarget {
  const { origin } = normalizeS3Endpoint(config.endpoint);
  const endpoint = new URL(origin);
  if (config.forcePathStyle) {
    const canonicalPath = `/${encodeRfc3986(config.bucket)}/${encodeKey(key)}`;
    const url = new URL(`${endpoint.origin}${canonicalPath}`);
    return {
      url,
      canonicalPath,
      host: url.host,
      forcePathStyle: true,
    };
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

function objectUrl(config: S3Config, key: string): S3ObjectTarget {
  return buildS3ObjectTarget(config, key);
}

export function parseS3ErrorBody(body: string, status: number): S3ErrorInfo {
  const code =
    body.match(/<Code>\s*([^<]+?)\s*<\/Code>/i)?.[1]?.trim() ||
    (status === 404 ? "HTTP_404" : `HTTP_${status}`);
  const message =
    body.match(/<Message>\s*([^<]+?)\s*<\/Message>/i)?.[1]?.trim() || "";
  return { status, code, message };
}

export function describeS3WriteFailure(info: S3ErrorInfo): string {
  const code = info.code.toLowerCase();
  if (
    code === "nosuchbucket" ||
    (info.status === 404 && (code === "http_404" || code === "nosuchkey"))
  ) {
    // PutObject почти никогда не означает «нет прав»: 404 = бакет/URL, не ACL.
    return "Бакет S3 не найден или URL хранилища неверный (HTTP 404 / NoSuchBucket). Проверьте S3_BUCKET и S3_ENDPOINT (origin без имени бакета), а также path-style (`S3_FORCE_PATH_STYLE=1`). HTTP 404 здесь не означает отказ ACL.";
  }
  if (
    code === "accessdenied" ||
    code === "allaccessdisabled" ||
    info.status === 403
  ) {
    return "Доступ к бакету S3 запрещён (AccessDenied). Проверьте права ключа на запись в бакет.";
  }
  if (
    code === "invalidaccesskeyid" ||
    code === "signaturedoesnotmatch" ||
    code === "expiredtoken"
  ) {
    return "S3 отклонил ключи доступа или подпись. Проверьте S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY и S3_REGION.";
  }
  if (code === "permanentredirect" || code === "temporaryredirect") {
    return "S3 требует другой endpoint/регион (Redirect). Проверьте S3_ENDPOINT и S3_REGION.";
  }
  return `Не удалось записать файл в хранилище (HTTP ${info.status}${info.code ? `, ${info.code}` : ""}).`;
}

async function readS3Error(res: Response): Promise<S3ErrorInfo> {
  const body = await res.text().catch(() => "");
  return parseS3ErrorBody(body, res.status);
}

function logS3Rejection(
  method: string,
  key: string,
  config: S3Config,
  info: S3ErrorInfo
) {
  const { origin, discardedPathSegments } = normalizeS3Endpoint(config.endpoint);
  console.error("S3 request rejected", {
    method,
    status: info.status,
    code: info.code,
    keyPrefix: key.split("/")[0] ?? "",
    forcePathStyle: config.forcePathStyle,
    endpointHost: new URL(origin).host,
    region: config.region,
    bucketLength: config.bucket.length,
    endpointPathSegmentsDiscarded: discardedPathSegments,
  });
}

async function signedFetch(
  config: S3Config,
  method: "GET" | "PUT" | "DELETE",
  key: string,
  body?: Buffer,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const { url, canonicalPath } = objectUrl(config, key);
  const now = amzDate();
  const dateStamp = now.slice(0, 8);
  const payloadHash = body ? sha256Hex(body) : sha256Hex("");
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": now,
    ...extraHeaders,
  };
  const signedHeaderNames = Object.keys(headers)
    .map((n) => n.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map((n) => `${n}:${headers[n]!.trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    canonicalPath,
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

  return fetch(url, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
}

async function signedFetchSafe(
  config: S3Config,
  method: "GET" | "PUT" | "DELETE",
  key: string,
  body?: Buffer,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  try {
    return await signedFetch(config, method, key, body, extraHeaders);
  } catch (err) {
    console.error("S3 request failed", {
      method,
      keyPrefix: key.split("/")[0] ?? "",
      name: err instanceof Error ? err.name : typeof err,
    });
    throw serviceUnavailable(
      "Не удалось связаться с файловым хранилищем S3. Проверьте S3_ENDPOINT и доступность бакета."
    );
  }
}

export async function s3Put(
  config: S3Config,
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  const { discardedPathSegments } = normalizeS3Endpoint(config.endpoint);
  if (discardedPathSegments > 0) {
    console.error("S3_ENDPOINT includes a path; bucket must be S3_BUCKET only", {
      discardedPathSegments,
      endpointHost: new URL(config.endpoint.trim()).host,
    });
  }
  const res = await signedFetchSafe(config, "PUT", key, bytes, {
    "content-type": contentType,
  });
  if (!res.ok) {
    const info = await readS3Error(res);
    logS3Rejection("PUT", key, config, info);
    throw serviceUnavailable(describeS3WriteFailure(info));
  }
}

export async function s3Get(config: S3Config, key: string): Promise<Buffer> {
  const res = await signedFetchSafe(config, "GET", key);
  if (res.status === 404) {
    const info = await readS3Error(res);
    if (info.code.toLowerCase() === "nosuchbucket") {
      logS3Rejection("GET", key, config, info);
      throw serviceUnavailable(describeS3WriteFailure(info));
    }
    throw Object.assign(new Error("not_found"), { code: "not_found" });
  }
  if (!res.ok) {
    const info = await readS3Error(res);
    logS3Rejection("GET", key, config, info);
    throw serviceUnavailable(
      `Не удалось прочитать файл из хранилища (HTTP ${info.status}${info.code ? `, ${info.code}` : ""}).`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export async function s3Delete(config: S3Config, key: string): Promise<void> {
  const res = await signedFetchSafe(config, "DELETE", key);
  if (!res.ok && res.status !== 404) {
    const info = await readS3Error(res);
    logS3Rejection("DELETE", key, config, info);
    throw serviceUnavailable(
      `Не удалось удалить файл из хранилища (HTTP ${info.status}${info.code ? `, ${info.code}` : ""}).`
    );
  }
}
