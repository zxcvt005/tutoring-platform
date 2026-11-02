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
  return REQUIRED_KEYS.filter((key) => !env[key]?.trim());
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
    throw livekitMisconfigured(
      `Не заданы переменные окружения: ${missing.join(", ")}. Добавьте их в .env.local и перезапустите локальный сервер.`
    );
  }

  const url = env.LIVEKIT_URL!.trim();
  const apiKey = env.LIVEKIT_API_KEY!.trim();
  const apiSecret = env.LIVEKIT_API_SECRET!.trim();

  if (!isLivekitUrl(url)) {
    throw livekitMisconfigured(
      "LIVEKIT_URL имеет неверный формат. Ожидается WebSocket URL (wss:// или ws://)."
    );
  }

  return { url, apiKey, apiSecret };
}
