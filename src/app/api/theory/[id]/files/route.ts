import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import { filesFromFormData, isMultipart } from "@/server/http/chat-uploads";
import { requireAuth } from "@/server/http/request";
import { uploadTheoryFile } from "@/server/services/theory-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    if (!isMultipart(request)) {
      throw validationError("Ожидалась загрузка файлов");
    }
    const { id } = await params;
    const ctx = await requireAuth(request);
    const form = await request.formData();
    const files = await filesFromFormData(form);
    if (files.length !== 1) {
      throw validationError("Загрузите один файл");
    }
    const db = getDb();
    const result = await uploadTheoryFile(db, ctx, id, files[0]!);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
