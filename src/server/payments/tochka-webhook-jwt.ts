import {
  createPublicKey,
  verify,
  type KeyObject,
  X509Certificate,
} from "node:crypto";

const DEFAULT_PUBLIC_KEY_URL =
  "https://enter.tochka.com/doc/openapi/static/keys/public";

type RsaJwk = {
  kty?: string;
  n?: string;
  e?: string;
  x5c?: string[];
};

let cachedKey: { key: KeyObject; fetchedAt: number; sourceUrl: string } | null =
  null;
const CACHE_MS = 60 * 60 * 1000;

function decodeJsonPart<T>(part: string): T {
  const json = Buffer.from(part, "base64url").toString("utf8");
  return JSON.parse(json) as T;
}

function isRsaJwk(value: unknown): value is RsaJwk {
  return Boolean(value && typeof value === "object");
}

/** Публичный ключ Точки: raw JWK `{kty,n,e}`, JWKS, x5c или PEM. */
export function parseTochkaPublicKeyMaterial(text: string): KeyObject {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Пустой публичный ключ Точки");
  }

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as RsaJwk & {
      keys?: RsaJwk[];
    };

    const candidates: RsaJwk[] = [];
    if (Array.isArray(parsed.keys) && parsed.keys.length > 0) {
      candidates.push(...parsed.keys);
    } else {
      candidates.push(parsed);
    }

    for (const candidate of candidates) {
      if (!isRsaJwk(candidate)) continue;

      if (candidate.x5c?.[0]) {
        const pem = `-----BEGIN CERTIFICATE-----\n${candidate.x5c[0]}\n-----END CERTIFICATE-----`;
        const cert = new X509Certificate(pem);
        return cert.publicKey;
      }

      if (candidate.kty === "RSA" && candidate.n && candidate.e) {
        return createPublicKey({
          key: {
            kty: "RSA",
            n: candidate.n,
            e: candidate.e,
          },
          format: "jwk",
        });
      }
    }

    throw new Error("JWK/JWKS не содержит поддерживаемого RSA-ключа");
  }

  if (trimmed.includes("BEGIN")) {
    return createPublicKey(trimmed);
  }

  throw new Error("Неизвестный формат публичного ключа Точки");
}

async function fetchPublicKey(url: string): Promise<KeyObject> {
  const now = Date.now();
  if (
    cachedKey &&
    cachedKey.sourceUrl === url &&
    now - cachedKey.fetchedAt < CACHE_MS
  ) {
    return cachedKey.key;
  }
  const res = await fetch(url, {
    headers: { Accept: "application/json,text/plain" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Не удалось загрузить публичный ключ Точки: HTTP ${res.status}`
    );
  }
  const key = parseTochkaPublicKeyMaterial(text);
  cachedKey = { key, fetchedAt: now, sourceUrl: url };
  return key;
}

/** Сброс кэша ключа — только для тестов. */
export function resetTochkaWebhookPublicKeyCacheForTests(): void {
  cachedKey = null;
}

export type VerifiedJwt<T> = {
  header: Record<string, unknown>;
  payload: T;
};

export function verifyTochkaWebhookJwtWithKey<T extends Record<string, unknown>>(
  token: string,
  key: KeyObject
): VerifiedJwt<T> {
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
  const ok = verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, "base64url")
  );
  if (!ok) throw new Error("Неверная подпись JWT");
  return { header, payload: decodeJsonPart<T>(payloadB64) };
}

export async function verifyTochkaWebhookJwt<T extends Record<string, unknown>>(
  token: string,
  publicKeyUrl = process.env.TOCHKA_WEBHOOK_PUBLIC_KEY_URL?.trim() ||
    DEFAULT_PUBLIC_KEY_URL
): Promise<VerifiedJwt<T>> {
  const key = await fetchPublicKey(publicKeyUrl);
  return verifyTochkaWebhookJwtWithKey<T>(token, key);
}
