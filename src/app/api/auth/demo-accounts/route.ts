import { isDemoLoginAllowed } from "@/server/auth/env";
import { getDb } from "@/server/db/runtime";
import { forbidden, jsonError, jsonOk } from "@/server/errors";
import { listDemoAccounts } from "@/server/services/demo-accounts";

/** Список тестовых аккаунтов закрыт вместе с демо-входом. */
export async function GET() {
  try {
    if (!isDemoLoginAllowed()) {
      throw forbidden("Демо-аккаунты недоступны");
    }
    const data = await listDemoAccounts(getDb());
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
