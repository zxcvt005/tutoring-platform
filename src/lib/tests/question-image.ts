import {
  extensionOf,
  safeOriginalName,
  sniffChatFile,
} from "@/lib/chat/file-sniff";
import type { TestQuestion } from "@/lib/types";

export const QUESTION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const QUESTION_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
] as const;

export type QuestionImageMime = "image/png" | "image/jpeg" | "image/webp";

const IMAGE_EXT_SET = new Set<string>(QUESTION_IMAGE_EXTENSIONS);

export function questionHasBody(question: TestQuestion): boolean {
  return Boolean(question.prompt?.trim() || question.imageObjectKey?.trim());
}

/** Есть ли в буфере обмена (paste) элемент с изображением — только тогда перехватываем вставку. */
export function clipboardHasImageItem(
  items: { length: number; [index: number]: { type: string } } | null | undefined
): boolean {
  if (!items) return false;
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.type.startsWith("image/")) return true;
  }
  return false;
}

export function testQuestionImageUrl(testId: string, questionId: string): string {
  return `/api/tests/${encodeURIComponent(testId)}/questions/${encodeURIComponent(questionId)}/image`;
}

export function sniffQuestionImage(
  bytes: Buffer,
  filename: string
): QuestionImageMime {
  const ext = extensionOf(filename);
  if (!IMAGE_EXT_SET.has(ext)) {
    throw new Error("Допустимы PNG, JPG, JPEG или WEBP");
  }
  if (bytes.length > QUESTION_IMAGE_MAX_BYTES) {
    throw new Error("Изображение больше 10 МБ");
  }
  const mime = sniffChatFile(bytes, filename);
  if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") {
    throw new Error("Файл не является изображением");
  }
  return mime;
}

export { safeOriginalName };
