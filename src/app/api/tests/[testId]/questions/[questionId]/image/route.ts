import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import { filesFromFormData, isMultipart } from "@/server/http/chat-uploads";
import { requireAuth } from "@/server/http/request";
import {
  deleteTestQuestionImage,
  getTestQuestionImage,
  uploadTestQuestionImage,
} from "@/server/services/test-question-image-service";

type Params = { params: Promise<{ testId: string; questionId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { testId, questionId } = await params;
    const ctx = await requireAuth(request);
    const db = getDb();
    const file = await getTestQuestionImage(db, ctx, testId, questionId);
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "content-type": file.mimeType,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    if (!isMultipart(request)) {
      throw validationError("Ожидалась загрузка изображения");
    }
    const { testId, questionId } = await params;
    const ctx = await requireAuth(request);
    const form = await request.formData();
    const files = await filesFromFormData(form);
    if (files.length !== 1) {
      throw validationError("Загрузите одно изображение");
    }
    const db = getDb();
    const result = await uploadTestQuestionImage(
      db,
      ctx,
      testId,
      questionId,
      files[0]!
    );
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const { testId, questionId } = await params;
    const ctx = await requireAuth(request);
    const db = getDb();
    const result = await deleteTestQuestionImage(db, ctx, testId, questionId);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
