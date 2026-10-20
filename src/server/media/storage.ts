import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { badRequest, notFound } from "@/server/errors";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function resolveUploadPath(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    !normalized.startsWith("teachers/")
  ) {
    throw badRequest("Некорректный ключ файла");
  }
  return path.join(UPLOAD_ROOT, normalized);
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
  const full = resolveUploadPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return key;
}

export async function readUpload(key: string): Promise<{
  bytes: Buffer;
  contentType: string;
}> {
  const full = resolveUploadPath(key);
  try {
    const bytes = await readFile(full);
    const ext = path.extname(full).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".gif"
          ? "image/gif"
          : ext === ".webp"
            ? "image/webp"
            : "image/jpeg";
    return { bytes, contentType };
  } catch {
    throw notFound("Файл не найден");
  }
}

export async function deleteUpload(key: string | null | undefined) {
  if (!key) return;
  try {
    await unlink(resolveUploadPath(key));
  } catch {
    /* ignore */
  }
}

export function publicMediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}
