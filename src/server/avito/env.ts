import { validationError } from "@/server/errors";

export type AvitoEnvConfig = {
  clientId: string;
  clientSecret: string;
  userId: string;
};

export function readAvitoEnv(
  env: NodeJS.ProcessEnv = process.env
): AvitoEnvConfig | null {
  const clientId = env.AVITO_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.AVITO_CLIENT_SECRET?.trim() ?? "";
  const userId = env.AVITO_USER_ID?.trim() ?? "";
  if (!clientId || !clientSecret || !userId) return null;
  return { clientId, clientSecret, userId };
}

export function requireAvitoEnv(
  env: NodeJS.ProcessEnv = process.env
): AvitoEnvConfig {
  const cfg = readAvitoEnv(env);
  if (!cfg) {
    throw validationError(
      "Avito API не настроен: задайте AVITO_CLIENT_ID, AVITO_CLIENT_SECRET и AVITO_USER_ID"
    );
  }
  if (!/^\d+$/.test(cfg.userId)) {
    throw validationError("AVITO_USER_ID должен быть числовым идентификатором");
  }
  return cfg;
}

export function isAvitoConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return readAvitoEnv(env) != null;
}
