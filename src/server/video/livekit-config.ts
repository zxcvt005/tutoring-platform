import { ApiError } from "@/server/errors";

const REQUIRED_KEYS = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
] as const;

export type LivekitConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

/** Имена незаданных переменных. Значения никогда не возвращаются. */
export function listMissingLivekitEnv(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return REQUIRED_KEYS.filter((key) => !readLivekitEnvValue(env, key));
}

function readLivekitEnvValue(
  env: NodeJS.ProcessEnv,
  key: (typeof REQUIRED_KEYS)[number]
): string {
  // Dynamic lookup keeps values runtime-resolvable (not build-time inlined).
  return String(env[key] ?? "").trim();
}

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production";
}

/**
 * User-facing copy when LiveKit env is incomplete.
 * Production must not mention .env.local; key names stay in server logs.
 */
export function livekitMissingEnvUserMessage(
  missing: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): string {
  if (isProductionRuntime(env)) {
    return "Видеосвязь временно недоступна из‑за ошибки конфигурации сервера. Обратитесь к администратору платформы.";
  }
  const names = missing.join(", ");
  return `Не заданы переменные окружения: ${names}. Добавьте их в .env.local и перезапустите локальный сервер.`;
}

export function livekitInvalidUrlUserMessage(
  env: NodeJS.ProcessEnv = process.env
): string {
  if (isProductionRuntime(env)) {
    return "Видеосвязь временно недоступна из‑за ошибки конфигурации сервера. Обратитесь к администратору платформы.";
  }
  return "LIVEKIT_URL имеет неверный формат. Ожидается WebSocket URL (wss:// или ws://).";
}

function livekitMisconfigured(message: string) {
  return new ApiError(503, "service_unavailable", message);
}

function isLivekitUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "wss:" ||
      url.protocol === "ws:" ||
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

export function getLivekitConfig(
  env: NodeJS.ProcessEnv = process.env
): LivekitConfig {
  const missing = listMissingLivekitEnv(env);
  if (missing.length > 0) {
    console.error(
      `[livekit] missing env keys (values omitted): ${missing.join(", ")}`
    );
    throw livekitMisconfigured(livekitMissingEnvUserMessage(missing, env));
  }

  const url = readLivekitEnvValue(env, "LIVEKIT_URL");
  const apiKey = readLivekitEnvValue(env, "LIVEKIT_API_KEY");
  const apiSecret = readLivekitEnvValue(env, "LIVEKIT_API_SECRET");

  if (!isLivekitUrl(url)) {
    console.error("[livekit] LIVEKIT_URL has invalid format");
    throw livekitMisconfigured(livekitInvalidUrlUserMessage(env));
  }

  return { url, apiKey, apiSecret };
}
