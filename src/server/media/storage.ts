import path from "node:path";

import { badRequest } from "@/server/errors";
import {
  deleteChatObject,
  getChatObject,
  putChatObject,
} from "@/server/media/chat-storage";

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function contentTypeForKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function saveTeacherPhoto(
  teacherId: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  let ext = ".webp";
  if (contentType.includes("png")) ext = ".png";
  else if (contentType.includes("jpeg") || contentType.includes("jpg"))
    ext = ".jpg";
  else if (contentType.includes("gif")) ext = ".gif";
  else if (contentType.includes("webp")) ext = ".webp";
  else throw badRequest("Допустимы JPG, PNG, WEBP, GIF");

  if (!ALLOWED_EXT.has(ext)) throw badRequest("Недопустимый тип файла");
  if (bytes.length > 2_500_000) throw badRequest("Файл больше 2.5 МБ");

  const key = `teachers/${teacherId}${ext}`;
  await putChatObject(key, bytes, contentType || contentTypeForKey(key));
  return key;
}

export async function readUpload(key: string): Promise<{
  bytes: Buffer;
  contentType: string;
}> {
  if (!key.startsWith("teachers/") || key.includes("..")) {
    throw badRequest("Некорректный ключ файла");
  }
  const bytes = await getChatObject(key);
  return { bytes, contentType: contentTypeForKey(key) };
}

export async function deleteUpload(key: string | null | undefined) {
  if (!key) return;
  try {
    await deleteChatObject(key);
  } catch {
    /* ignore */
  }
}

export function publicMediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}
