import { isDemoLoginAllowed } from "@/server/auth/env";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { needsBootstrapAdmin } from "@/server/services/bootstrap-admin-service";
import { listDemoAccounts } from "@/server/services/demo-accounts";

export async function GET() {
  try {
    const db = getDb();
    const needsBootstrap = await needsBootstrapAdmin(db);
    const demoLogin = isDemoLoginAllowed();
    const demoAccounts = demoLogin
      ? (await listDemoAccounts(db).catch(() => ({ accounts: [] }))).accounts
      : [];
    return jsonOk({
      demoLogin,
      needsBootstrap,
      production: process.env.NODE_ENV === "production",
      demoAccounts,
    });
  } catch (err) {
    return jsonError(err);
  }
}
