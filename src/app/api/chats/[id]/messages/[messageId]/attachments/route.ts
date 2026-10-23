import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import { filesFromFormData, isMultipart } from "@/server/http/chat-uploads";
import { requireAuth } from "@/server/http/request";
import { retryMessageAttachments } from "@/server/services/chat-service";

type Params = { params: Promise<{ id: string; messageId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    if (!isMultipart(request)) {
      throw validationError("Ожидалась загрузка файлов");
    }
    const { id, messageId } = await params;
    const ctx = await requireAuth(request);
    const form = await request.formData();
    const db = getDb();
    const result = await retryMessageAttachments(db, ctx, {
      chatId: id,
      messageId,
      files: await filesFromFormData(form),
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
