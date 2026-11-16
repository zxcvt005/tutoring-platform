import { createPublicKey, verify, X509Certificate } from "node:crypto";

const DEFAULT_PUBLIC_KEY_URL =
  "https://enter.tochka.com/doc/openapi/static/keys/public";

let cachedPem: { pem: string; fetchedAt: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

function decodeJsonPart<T>(part: string): T {
  const json = Buffer.from(part, "base64url").toString("utf8");
  return JSON.parse(json) as T;
}

async function fetchPublicKeyPem(url: string): Promise<string> {
  const now = Date.now();
  if (cachedPem && now - cachedPem.fetchedAt < CACHE_MS) {
    return cachedPem.pem;
  }
  const res = await fetch(url, { headers: { Accept: "application/json,text/plain" } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Не удалось загрузить публичный ключ Точки: HTTP ${res.status}`);
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    const jwks = JSON.parse(trimmed) as {
      keys?: Array<{ kty?: string; n?: string; e?: string; x5c?: string[] }>;
    };
    const key = jwks.keys?.[0];
    if (key?.x5c?.[0]) {
      const pem = `-----BEGIN CERTIFICATE-----\n${key.x5c[0]}\n-----END CERTIFICATE-----`;
      const cert = new X509Certificate(pem);
      const pub = cert.publicKey.export({ type: "spki", format: "pem" });
      cachedPem = { pem: String(pub), fetchedAt: now };
      return cachedPem.pem;
    }
    throw new Error("JWKS не содержит поддерживаемого ключа");
  }
  if (!trimmed.includes("BEGIN")) {
    throw new Error("Неизвестный формат публичного ключа Точки");
  }
  cachedPem = { pem: trimmed, fetchedAt: now };
  return trimmed;
}

export type VerifiedJwt<T> = {
  header: Record<string, unknown>;
  payload: T;
};

export async function verifyTochkaWebhookJwt<T extends Record<string, unknown>>(
  token: string,
  publicKeyUrl = process.env.TOCHKA_WEBHOOK_PUBLIC_KEY_URL?.trim() ||
    DEFAULT_PUBLIC_KEY_URL
): Promise<VerifiedJwt<T>> {
  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new Error("Некорректный JWT");
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeJsonPart<Record<string, unknown>>(headerB64);
  const alg = String(header.alg ?? "");
  if (alg !== "RS256") {
    throw new Error(`Неподдерживаемый alg: ${alg}`);
  }
  const pem = await fetchPublicKeyPem(publicKeyUrl);
  const key = createPublicKey(pem);
  const ok = verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, "base64url")
  );
  if (!ok) throw new Error("Неверная подпись JWT");
  return { header, payload: decodeJsonPart<T>(payloadB64) };
}