export const THEORY_MAX_FILES = 10;
export const THEORY_MAX_FILE_BYTES = 20 * 1024 * 1024;

export const THEORY_ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

export const THEORY_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type TheoryAllowedMime = (typeof THEORY_ALLOWED_MIME_TYPES)[number];
