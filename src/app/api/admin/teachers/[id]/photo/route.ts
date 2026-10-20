import { and, eq } from "drizzle-orm";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { requireRoles } from "@/server/authz/require";
import { getDb } from "@/server/db/runtime";
import { teachers } from "@/server/db/schema";
import { jsonError, jsonOk, notFound, validationError } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import {
  deleteUpload,
  publicMediaUrl,
  saveTeacherPhoto,
} from "@/server/media/storage";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    requireRoles(ctx, ["director"]);
    const { id } = await context.params;
    const db = getDb();

    const [teacher] = await db
      .select()
      .from(teachers)
      .where(
        and(
          eq(teachers.id, id),
          eq(teachers.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!teacher) throw notFound("Преподаватель не найден");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw validationError("Прикрепите файл фотографии");
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const key = await saveTeacherPhoto(
      id,
      buf,
      file.type || "image/jpeg"
    );
    if (teacher.photoKey && teacher.photoKey !== key) {
      await deleteUpload(teacher.photoKey);
    }
    await db
      .update(teachers)
      .set({ photoKey: key, updatedAt: new Date() })
      .where(eq(teachers.id, id));

    return jsonOk({ photoKey: key, photoUrl: publicMediaUrl(key) });
  } catch (err) {
    return jsonError(err);
  }
}
