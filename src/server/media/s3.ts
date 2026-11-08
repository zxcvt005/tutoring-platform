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

function objectUrl(config: S3Config, key: string): { url: URL; canonicalPath: string } {
  const endpoint = new URL(config.endpoint);
  if (config.forcePathStyle) {
    const url = new URL(
      `${endpoint.origin}/${encodeRfc3986(config.bucket)}/${encodeKey(key)}`
    );
    return {
      url,
      canonicalPath: `/${encodeRfc3986(config.bucket)}/${encodeKey(key)}`,
    };
  }
  const url = new URL(`${endpoint.protocol}//${config.bucket}.${endpoint.host}/${encodeKey(key)}`);
  return { url, canonicalPath: `/${encodeKey(key)}` };
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
      // ключ без секретов; endpoint/host не логируем с credentials
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
  const res = await signedFetchSafe(config, "PUT", key, bytes, {
    "content-type": contentType,
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    console.error("S3 PUT rejected", { status: res.status, keyPrefix: key.split("/")[0] ?? "" });
    throw serviceUnavailable(
      `Не удалось записать файл в хранилище (HTTP ${res.status}). Проверьте права ключа S3 на запись в бакет.`
    );
  }
}

export async function s3Get(config: S3Config, key: string): Promise<Buffer> {
  const res = await signedFetchSafe(config, "GET", key);
  if (res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    throw Object.assign(new Error("not_found"), { code: "not_found" });
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    console.error("S3 GET rejected", { status: res.status, keyPrefix: key.split("/")[0] ?? "" });
    throw serviceUnavailable(
      `Не удалось прочитать файл из хранилища (HTTP ${res.status}).`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export async function s3Delete(config: S3Config, key: string): Promise<void> {
  const res = await signedFetchSafe(config, "DELETE", key);
  if (!res.ok && res.status !== 404) {
    await res.body?.cancel().catch(() => undefined);
    console.error("S3 DELETE rejected", {
      status: res.status,
      keyPrefix: key.split("/")[0] ?? "",
    });
    throw serviceUnavailable(
      `Не удалось удалить файл из хранилища (HTTP ${res.status}).`
    );
  }
}
