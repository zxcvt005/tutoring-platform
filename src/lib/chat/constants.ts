export const CHAT_MAX_FILES = 5;
export const CHAT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const CHAT_MAX_BODY_CHARS = 4000;
export const CHAT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CHAT_PAGE_SIZE = 40;
export const CHAT_LIST_PAGE_SIZE = 30;
export const CHAT_PENDING_TTL_MS = 6 * 60 * 60 * 1000;

export const CHAT_ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
] as const;

export const CHAT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type ChatAllowedMime = (typeof CHAT_ALLOWED_MIME_TYPES)[number];

export const CHAT_EMPTY_STUDENT =
  "Здесь вы можете общаться с преподавателем";
export const CHAT_EMPTY_TEACHER = "Напишите сообщение ученику";
export const CHAT_DELETED_PLACEHOLDER = "Сообщение удалено";
export const CHAT_READ_ONLY =
  "Этот чат доступен только для чтения: связь с преподавателем уже не активна";
