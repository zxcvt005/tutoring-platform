import {
  CHAT_ALLOWED_EXTENSIONS,
  CHAT_MAX_FILE_BYTES,
  type ChatAllowedMime,
} from "@/lib/chat/constants";

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = Buffer.from("%PDF");
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const WEBP_RIFF = Buffer.from("RIFF");
const WEBP_TAG = Buffer.from("WEBP");
const ZIP_PK = Buffer.from([0x50, 0x4b]);

export function extensionOf(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot).toLowerCase();
}

export function safeOriginalName(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() || "file";
  const cleaned = base
    .replace(/[^\w.\u0400-\u04FF ()-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180)
    .trim();
  return cleaned || "file";
}

function startsWith(buf: Buffer, magic: Buffer, offset = 0): boolean {
  if (buf.length < offset + magic.length) return false;
  return buf.subarray(offset, offset + magic.length).equals(magic);
}

function looksLikeDocx(buf: Buffer): boolean {
  if (!startsWith(buf, ZIP_PK)) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 256 * 1024)).toString("latin1");
  return sample.includes("word/") || sample.includes("[Content_Types].xml");
}

function looksLikeWebp(buf: Buffer): boolean {
  return startsWith(buf, WEBP_RIFF) && buf.length >= 12 && startsWith(buf, WEBP_TAG, 8);
}

export function sniffChatFile(bytes: Buffer, filename: string): ChatAllowedMime {
  const ext = extensionOf(filename);
  if (!CHAT_ALLOWED_EXTENSIONS.includes(ext as (typeof CHAT_ALLOWED_EXTENSIONS)[number])) {
    throw new Error("Неподдерживаемый тип файла");
  }
  if (bytes.length > CHAT_MAX_FILE_BYTES) {
    throw new Error("Файл больше 20 МБ");
  }
  if (bytes.length === 0) {
    throw new Error("Пустой файл");
  }

  let mime: ChatAllowedMime | null = null;
  if (startsWith(bytes, JPEG)) mime = "image/jpeg";
  else if (startsWith(bytes, PNG)) mime = "image/png";
  else if (looksLikeWebp(bytes)) mime = "image/webp";
  else if (startsWith(bytes, PDF)) mime = "application/pdf";
  else if (startsWith(bytes, OLE)) mime = "application/msword";
  else if (looksLikeDocx(bytes)) {
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (!mime) {
    throw new Error("Не удалось определить тип файла");
  }

  const extMatches =
    (mime === "image/jpeg" && (ext === ".jpg" || ext === ".jpeg")) ||
    (mime === "image/png" && ext === ".png") ||
    (mime === "image/webp" && ext === ".webp") ||
    (mime === "application/pdf" && ext === ".pdf") ||
    (mime === "application/msword" && ext === ".doc") ||
    (mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      ext === ".docx");

  if (!extMatches) {
    throw new Error("Расширение файла не совпадает с содержимым");
  }
  return mime;
}

export function isChatImageMime(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

export function extForMime(mime: ChatAllowedMime): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    case "application/msword":
      return ".doc";
    default:
      return ".docx";
  }
}
