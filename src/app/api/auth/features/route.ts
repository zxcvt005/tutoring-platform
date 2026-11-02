import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { needsBootstrapAdmin } from "@/server/services/bootstrap-admin-service";

export async function GET() {
  try {
    const db = getDb();
    const needsBootstrap = await needsBootstrapAdmin(db);
    return jsonOk({
      demoLogin: false,
      needsBootstrap,
      production: process.env.NODE_ENV === "production",
      demoAccounts: [],
    });
  } catch (err) {
    return jsonError(err);
  }
}
