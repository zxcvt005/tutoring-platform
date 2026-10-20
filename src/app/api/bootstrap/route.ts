import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { buildBootstrap } from "@/server/services/bootstrap-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const data = await buildBootstrap(getDb(), ctx);
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
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
