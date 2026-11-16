import type { AuthContext } from "@/server/authz/context";
import type { AppDb } from "@/server/db/types";
import {
  recordConsentBundle,
} from "@/server/services/legal-consents-service";

/**
 * Не роняет основную операцию (заявка/регистрация), если журнал согласий
 * временно недоступен (миграция ещё не применена и т.п.).
 */
export async function safeRecordConsentBundle(
  db: AppDb,
  ctx: AuthContext | null,
  input: Parameters<typeof recordConsentBundle>[2]
): Promise<void> {
  try {
    await recordConsentBundle(db, ctx, input);
  } catch (err) {
    console.error(
      "[legal_consents] failed to record consent bundle",
      err instanceof Error ? err.message : err
    );
  }
}
