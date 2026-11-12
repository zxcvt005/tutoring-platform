import { validationError } from "@/server/errors";

export type AvitoEnvConfig = {
  clientId: string;
  clientSecret: string;
  userId: string;
};

const AVITO_KEYS = [
  "AVITO_CLIENT_ID",
  "AVITO_CLIENT_SECRET",
  "AVITO_USER_ID",
] as const;

export type AvitoEnvKey = (typeof AVITO_KEYS)[number];

/** Безопасная диагностика: только наличие и формат, без значений. */
export type AvitoEnvDiagnosis = {
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasUserId: boolean;
  userIdIsNumeric: boolean;
  configured: boolean;
  missingKeys: AvitoEnvKey[];
};

function readAvitoEnvValue(
  env: NodeJS.ProcessEnv,
  key: AvitoEnvKey
): string {
  // Dynamic lookup keeps values runtime-resolvable (not build-time inlined).
  return String(env[key] ?? "").trim();
}

export function diagnoseAvitoEnv(
  env: NodeJS.ProcessEnv = process.env
): AvitoEnvDiagnosis {
  const clientId = readAvitoEnvValue(env, "AVITO_CLIENT_ID");
  const clientSecret = readAvitoEnvValue(env, "AVITO_CLIENT_SECRET");
  const userId = readAvitoEnvValue(env, "AVITO_USER_ID");
  const hasClientId = clientId.length > 0;
  const hasClientSecret = clientSecret.length > 0;
  const hasUserId = userId.length > 0;
  const userIdIsNumeric = hasUserId && /^\d+$/.test(userId);
  const missingKeys = AVITO_KEYS.filter((key) => !readAvitoEnvValue(env, key));
  return {
    hasClientId,
    hasClientSecret,
    hasUserId,
    userIdIsNumeric,
    configured: missingKeys.length === 0 && userIdIsNumeric,
    missingKeys: [...missingKeys],
  };
}

export function readAvitoEnv(
  env: NodeJS.ProcessEnv = process.env
): AvitoEnvConfig | null {
  const clientId = readAvitoEnvValue(env, "AVITO_CLIENT_ID");
  const clientSecret = readAvitoEnvValue(env, "AVITO_CLIENT_SECRET");
  const userId = readAvitoEnvValue(env, "AVITO_USER_ID");
  if (!clientId || !clientSecret || !userId) return null;
  return { clientId, clientSecret, userId };
}

export function requireAvitoEnv(
  env: NodeJS.ProcessEnv = process.env
): AvitoEnvConfig {
  const diagnosis = diagnoseAvitoEnv(env);
  if (diagnosis.missingKeys.length > 0) {
    throw validationError(
      `Avito API не настроен: задайте ${diagnosis.missingKeys.join(", ")}`
    );
  }
  const cfg = readAvitoEnv(env);
  if (!cfg) {
    throw validationError(
      "Avito API не настроен: задайте AVITO_CLIENT_ID, AVITO_CLIENT_SECRET и AVITO_USER_ID"
    );
  }
  if (!diagnosis.userIdIsNumeric) {
    throw validationError("AVITO_USER_ID должен быть числовым идентификатором");
  }
  return cfg;
}

export function isAvitoConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return diagnoseAvitoEnv(env).configured;
}
