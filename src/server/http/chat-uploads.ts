import { normalizeQuestionImageFileName } from "@/lib/tests/question-image";
import type { ChatUploadInput } from "@/server/services/chat-service";

export async function filesFromFormData(form: FormData): Promise<ChatUploadInput[]> {
  const out: ChatUploadInput[] = [];
  for (const item of form.getAll("files")) {
    if (typeof item === "string") continue;
    const file = item as File;
    const bytes = Buffer.from(await file.arrayBuffer());
    out.push({ bytes, filename: file.name || "file" });
  }
  return out;
}

/** FormData для изображений вопросов: пустое имя (Ctrl+V) → clipboard.{ext}. */
export async function questionImageFromFormData(
  form: FormData
): Promise<ChatUploadInput[]> {
  const out: ChatUploadInput[] = [];
  for (const item of form.getAll("files")) {
    if (typeof item === "string") continue;
    const file = item as File;
    const bytes = Buffer.from(await file.arrayBuffer());
    out.push({
      bytes,
      filename: normalizeQuestionImageFileName(file.name, file.type),
    });
  }
  return out;
}

export function isMultipart(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").includes("multipart/form-data");
}
