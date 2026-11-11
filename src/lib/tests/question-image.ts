import { extensionOf, safeOriginalName } from "@/lib/chat/file-sniff";
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

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_RIFF = Buffer.from("RIFF");
const WEBP_TAG = Buffer.from("WEBP");

/**
 * Ожидаемая ошибка ввода для изображений вопросов.
 * Совместима с toErrorBody (status/code) без импорта server/errors в клиентский бандл.
 */
export class QuestionImageValidationError extends Error {
  readonly status = 400;
  readonly code = "validation_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "QuestionImageValidationError";
  }
}

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

export function testQuestionImageUrl(
  testId: string,
  questionId: string,
  imageObjectKey?: string | null
): string {
  const base = `/api/tests/${encodeURIComponent(testId)}/questions/${encodeURIComponent(questionId)}/image`;
  if (!imageObjectKey) return base;
  const stamp =
    imageObjectKey.split("/").pop() ||
    imageObjectKey.slice(Math.max(0, imageObjectKey.length - 16));
  return `${base}?v=${encodeURIComponent(stamp)}`;
}

function startsWith(buf: Buffer, magic: Buffer, offset = 0): boolean {
  if (buf.length < offset + magic.length) return false;
  return buf.subarray(offset, offset + magic.length).equals(magic);
}

function looksLikeWebp(buf: Buffer): boolean {
  return (
    startsWith(buf, WEBP_RIFF) &&
    buf.length >= 12 &&
    startsWith(buf, WEBP_TAG, 8)
  );
}

/** MIME только по magic bytes — имя файла не доверяем. */
export function detectQuestionImageMime(
  bytes: Buffer
): QuestionImageMime | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (looksLikeWebp(bytes)) return "image/webp";
  return null;
}

export function extensionForQuestionImageMime(mime: QuestionImageMime): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

function mimeFromClientHint(type: string | undefined | null): QuestionImageMime | null {
  const t = (type ?? "").toLowerCase().trim();
  if (t === "image/png") return "image/png";
  if (t === "image/webp") return "image/webp";
  if (t === "image/jpeg" || t === "image/jpg") return "image/jpeg";
  return null;
}

/**
 * Имя для FormData: если браузер дал пустое/без расширения (Ctrl+V),
 * подставляем clipboard.{ext} по MIME-подсказке.
 */
export function normalizeQuestionImageFileName(
  name: string | undefined | null,
  mimeHint?: string | null
): string {
  const raw = (name ?? "").trim();
  const base = raw ? safeOriginalName(raw) : "";
  const ext = extensionOf(base);
  if (base && IMAGE_EXT_SET.has(ext)) return base;

  const hinted = mimeFromClientHint(mimeHint);
  const fallbackExt = hinted
    ? extensionForQuestionImageMime(hinted)
    : ".png";
  const stem =
    base && !ext
      ? base
      : base
        ? base.replace(/\.[^.]+$/, "") || "clipboard"
        : "clipboard";
  return `${stem}${fallbackExt}`;
}

/**
 * Проверка содержимого изображения вопроса.
 * Расширение в имени необязательно (clipboard); если есть — должно совпадать с magic bytes.
 */
export function sniffQuestionImage(
  bytes: Buffer,
  filename: string
): QuestionImageMime {
  if (!bytes.length) {
    throw new QuestionImageValidationError("Пустой файл изображения");
  }
  if (bytes.length > QUESTION_IMAGE_MAX_BYTES) {
    throw new QuestionImageValidationError("Изображение больше 10 МБ");
  }

  const mime = detectQuestionImageMime(bytes);
  if (!mime) {
    throw new QuestionImageValidationError(
      "Файл не является изображением PNG, JPG или WEBP"
    );
  }

  const ext = extensionOf(filename);
  if (ext) {
    if (!IMAGE_EXT_SET.has(ext)) {
      throw new QuestionImageValidationError(
        "Допустимы PNG, JPG, JPEG или WEBP"
      );
    }
    const extMatches =
      (mime === "image/jpeg" && (ext === ".jpg" || ext === ".jpeg")) ||
      (mime === "image/png" && ext === ".png") ||
      (mime === "image/webp" && ext === ".webp");
    if (!extMatches) {
      throw new QuestionImageValidationError(
        "Расширение файла не совпадает с содержимым"
      );
    }
  }

  return mime;
}

export { safeOriginalName, extensionOf };
