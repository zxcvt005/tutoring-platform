import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/errors";
import {
  getLivekitConfig,
  listMissingLivekitEnv,
  livekitInvalidUrlUserMessage,
  livekitMissingEnvUserMessage,
} from "@/server/video/livekit-config";

describe("livekit config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists missing env names without values", () => {
    const missing = listMissingLivekitEnv({
      LIVEKIT_URL: "wss://example.livekit.cloud",
      LIVEKIT_API_KEY: "  ",
    } as NodeJS.ProcessEnv);
    expect(missing).toEqual(["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]);
    expect(missing.join(" ")).not.toContain("wss://");
  });

  it("uses .env.local guidance only outside production", () => {
    const local = livekitMissingEnvUserMessage(
      ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
      { NODE_ENV: "development" } as NodeJS.ProcessEnv
    );
    expect(local).toContain(".env.local");
    expect(local).toContain("LIVEKIT_URL");

    const prod = livekitMissingEnvUserMessage(
      ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
      { NODE_ENV: "production" } as NodeJS.ProcessEnv
    );
    expect(prod).not.toContain(".env.local");
    expect(prod).not.toContain("LIVEKIT_API_SECRET");
    expect(prod).toMatch(/конфигурации сервера/i);
  });

  it("hides invalid-url details from production clients", () => {
    expect(
      livekitInvalidUrlUserMessage({
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv)
    ).toContain("LIVEKIT_URL");
    expect(
      livekitInvalidUrlUserMessage({
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv)
    ).not.toContain("LIVEKIT_URL");
  });

  it("throws 503 and logs missing keys without secrets in production", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getLivekitConfig({
        NODE_ENV: "production",
        LIVEKIT_URL: "wss://secret-host.example",
      } as NodeJS.ProcessEnv);
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const api = err as ApiError;
      expect(api.status).toBe(503);
      expect(api.code).toBe("service_unavailable");
      expect(api.message).not.toContain(".env.local");
      expect(api.message).not.toContain("secret-host");
      expect(api.message).not.toContain("LIVEKIT_API_SECRET");
    }
    expect(errSpy).toHaveBeenCalled();
    const logged = String(errSpy.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("LIVEKIT_API_KEY");
    expect(logged).toContain("LIVEKIT_API_SECRET");
    expect(logged).not.toContain("secret-host");
  });

  it("returns trimmed config when all required keys are present", () => {
    const config = getLivekitConfig({
      NODE_ENV: "production",
      LIVEKIT_URL: "  wss://video.example  ",
      LIVEKIT_API_KEY: " key ",
      LIVEKIT_API_SECRET: " secret ",
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({
      url: "wss://video.example",
      apiKey: "key",
      apiSecret: "secret",
    });
  });

  it("does not read LIVEKIT_CLOUD_* aliases", () => {
    const missing = listMissingLivekitEnv({
      NODE_ENV: "production",
      LIVEKIT_CLOUD_URL: "wss://cloud.example",
      LIVEKIT_CLOUD_API_KEY: "cloud-key",
      LIVEKIT_CLOUD_API_SECRET: "cloud-secret",
    } as NodeJS.ProcessEnv);
    expect(missing).toEqual([
      "LIVEKIT_URL",
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
    ]);
  });
});
