import { extensionOf, sniffChatFile } from "@/lib/chat/file-sniff";
import {
  THEORY_ALLOWED_EXTENSIONS,
  THEORY_MAX_FILE_BYTES,
  type TheoryAllowedMime,
} from "@/lib/theory/constants";

export function sniffTheoryFile(bytes: Buffer, filename: string): TheoryAllowedMime {
  const ext = extensionOf(filename);
  if (
    !THEORY_ALLOWED_EXTENSIONS.includes(
      ext as (typeof THEORY_ALLOWED_EXTENSIONS)[number]
    )
  ) {
    throw new Error("Для теории доступны PDF, DOC и DOCX");
  }
  if (bytes.length > THEORY_MAX_FILE_BYTES) {
    throw new Error("Файл больше 20 МБ");
  }
  const mime = sniffChatFile(bytes, filename);
  if (
    mime !== "application/pdf" &&
    mime !== "application/msword" &&
    mime !==
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    throw new Error("Для теории доступны PDF, DOC и DOCX");
  }
  return mime;
}

export function theoryFileKindLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "application/msword") return "DOC";
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "DOCX";
  }
  return "Файл";
}
