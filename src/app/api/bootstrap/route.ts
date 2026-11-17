import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { withServerTiming } from "@/server/observability/timing";
import { buildBootstrap } from "@/server/services/bootstrap-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const data = await withServerTiming(
      {
        route: "GET /api/bootstrap",
        role: ctx.role,
        organizationId: ctx.organizationId,
      },
      () => buildBootstrap(getDb(), ctx)
    );
    return jsonOk({
      data,
      auth: {
        userId: ctx.userId,
        role: ctx.role,
        organizationId: ctx.organizationId,
        teacherId: ctx.teacherId,
        studentId: ctx.studentId,
        fullName: ctx.fullName,
        email: ctx.email,
        impersonation: ctx.impersonation,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
