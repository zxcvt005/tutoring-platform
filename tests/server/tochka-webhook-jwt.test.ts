import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseTochkaPublicKeyMaterial,
  resetTochkaWebhookPublicKeyCacheForTests,
  verifyTochkaWebhookJwt,
  verifyTochkaWebhookJwtWithKey,
} from "@/server/payments/tochka-webhook-jwt";

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signRs256Jwt(
  privateKeyPem: string,
  payload: Record<string, unknown>
): string {
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  const body = b64urlJson(payload);
  const data = `${header}.${body}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const signature = signer.sign(privateKeyPem).toString("base64url");
  return `${data}.${signature}`;
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicJwk = publicKey.export({ format: "jwk" });

afterEach(() => {
  resetTochkaWebhookPublicKeyCacheForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseTochkaPublicKeyMaterial", () => {
  it("parses raw RSA JWK with n/e (Tochka format)", () => {
    const material = JSON.stringify({
      kty: "RSA",
      e: publicJwk.e,
      n: publicJwk.n,
    });
    const key = parseTochkaPublicKeyMaterial(material);
    expect(key.asymmetricKeyType).toBe("rsa");
  });

  it("parses JWKS wrapper with n/e", () => {
    const material = JSON.stringify({
      keys: [{ kty: "RSA", e: publicJwk.e, n: publicJwk.n }],
    });
    expect(parseTochkaPublicKeyMaterial(material).asymmetricKeyType).toBe("rsa");
  });

  it("parses PEM", () => {
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(parseTochkaPublicKeyMaterial(pem).asymmetricKeyType).toBe("rsa");
  });

  it("rejects unsupported JSON", () => {
    expect(() => parseTochkaPublicKeyMaterial(JSON.stringify({ kty: "EC" }))).toThrow(
      /не содержит поддерживаемого RSA-ключа/i
    );
  });
});

describe("verifyTochkaWebhookJwtWithKey", () => {
  it("accepts a valid RS256 JWT", () => {
    const token = signRs256Jwt(privatePem, {
      status: "TEST",
      webhookType: "acquiringInternetPayment",
      amount: "1.00",
    });
    const key = parseTochkaPublicKeyMaterial(
      JSON.stringify({ kty: "RSA", e: publicJwk.e, n: publicJwk.n })
    );
    const verified = verifyTochkaWebhookJwtWithKey<Record<string, unknown>>(
      token,
      key
    );
    expect(verified.payload.status).toBe("TEST");
    expect(verified.header.alg).toBe("RS256");
  });

  it("rejects tampered payload", () => {
    const token = signRs256Jwt(privatePem, { status: "APPROVED" });
    const [h, , s] = token.split(".");
    const forgedBody = b64urlJson({ status: "APPROVED", amount: "999" });
    const key = parseTochkaPublicKeyMaterial(
      JSON.stringify({ kty: "RSA", e: publicJwk.e, n: publicJwk.n })
    );
    expect(() =>
      verifyTochkaWebhookJwtWithKey(`${h}.${forgedBody}.${s}`, key)
    ).toThrow(/Неверная подпись/i);
  });

  it("rejects non-RS256 alg", () => {
    const header = b64urlJson({ alg: "none", typ: "JWT" });
    const body = b64urlJson({ status: "TEST" });
    const key = parseTochkaPublicKeyMaterial(
      JSON.stringify({ kty: "RSA", e: publicJwk.e, n: publicJwk.n })
    );
    expect(() =>
      verifyTochkaWebhookJwtWithKey(`${header}.${body}.x`, key)
    ).toThrow(/Неподдерживаемый alg/i);
  });

  it("rejects malformed token", () => {
    const key = parseTochkaPublicKeyMaterial(
      JSON.stringify({ kty: "RSA", e: publicJwk.e, n: publicJwk.n })
    );
    expect(() => verifyTochkaWebhookJwtWithKey("not.a.jwt.extra", key)).toThrow(
      /Некорректный JWT/i
    );
  });
});

describe("verifyTochkaWebhookJwt", () => {
  it("loads raw JWK from public key URL and verifies", async () => {
    const material = JSON.stringify({
      kty: "RSA",
      e: publicJwk.e,
      n: publicJwk.n,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(material, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const token = signRs256Jwt(privatePem, {
      status: "TEST",
      ping: true,
    });
    const verified = await verifyTochkaWebhookJwt<Record<string, unknown>>(
      token,
      "https://example.test/tochka-public"
    );
    expect(verified.payload.status).toBe("TEST");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caches public key between calls", async () => {
    const material = JSON.stringify({
      kty: "RSA",
      e: publicJwk.e,
      n: publicJwk.n,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(material, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = signRs256Jwt(privatePem, { status: "TEST" });
    await verifyTochkaWebhookJwt(token, "https://example.test/tochka-public");
    await verifyTochkaWebhookJwt(token, "https://example.test/tochka-public");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails when public key endpoint errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 }))
    );
    const token = signRs256Jwt(privatePem, { status: "TEST" });
    await expect(
      verifyTochkaWebhookJwt(token, "https://example.test/tochka-public")
    ).rejects.toThrow(/HTTP 503/i);
  });
});
