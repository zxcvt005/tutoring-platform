import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { badRequest, notFound } from "@/server/errors";
import { s3Delete, s3Get, s3Put, type S3Config } from "@/server/media/s3";

export type ChatObjectStore = {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
};

function assertSafeChatKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    !/^(chats|chat-pending|theory|theory-pending)\//.test(normalized) ||
    !/^[a-zA-Z0-9/._-]+$/.test(normalized)
  ) {
    throw badRequest("Некорректный ключ файла");
  }
  return normalized;
}

function localRoot(): string {
  return process.env.CHAT_UPLOAD_ROOT
    ? path.resolve(process.env.CHAT_UPLOAD_ROOT)
    : path.join(process.cwd(), "uploads", "chat");
}

function readS3Config(): S3Config | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;
  return {
    endpoint,
    region: process.env.S3_REGION?.trim() || "ru-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
  };
}

function requestedDriver(): "s3" | "local" | "auto" {
  const raw = (process.env.CHAT_STORAGE_DRIVER ?? "auto").trim().toLowerCase();
  if (raw === "s3" || raw === "local") return raw;
  return "auto";
}

export function resolveChatStorageDriver(): "s3" | "local" {
  const requested = requestedDriver();
  const s3 = readS3Config();
  if (requested === "s3") {
    if (!s3) {
      throw badRequest(
        "Хранилище файлов не настроено. Задайте S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID и S3_SECRET_ACCESS_KEY."
      );
    }
    return "s3";
  }
  if (requested === "local") return "local";
  if (s3) return "s3";
  if (process.env.NODE_ENV === "production" && process.env.CHAT_STORAGE_ALLOW_LOCAL !== "1") {
    throw badRequest(
      "Для вложений чата в production нужно S3-совместимое хранилище. Локальный диск контейнера не сохраняет файлы после деплоя."
    );
  }
  return "local";
}

function localStore(): ChatObjectStore {
  return {
    async put(key, bytes) {
      const safe = assertSafeChatKey(key);
      const full = path.join(localRoot(), safe);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
    async get(key) {
      const safe = assertSafeChatKey(key);
      try {
        return await readFile(path.join(localRoot(), safe));
      } catch {
        throw notFound("Файл не найден");
      }
    },
    async delete(key) {
      const safe = assertSafeChatKey(key);
      try {
        await unlink(path.join(localRoot(), safe));
      } catch {
        /* ignore missing */
      }
    },
  };
}

function s3Store(config: S3Config): ChatObjectStore {
  return {
    async put(key, bytes, contentType) {
      const safe = assertSafeChatKey(key);
      await s3Put(config, safe, bytes, contentType);
    },
    async get(key) {
      const safe = assertSafeChatKey(key);
      try {
        return await s3Get(config, safe);
      } catch (err) {
        if ((err as { code?: string }).code === "not_found") {
          throw notFound("Файл не найден");
        }
        throw err;
      }
    },
    async delete(key) {
      const safe = assertSafeChatKey(key);
      await s3Delete(config, safe);
    },
  };
}

let testStore: ChatObjectStore | null = null;

export function setChatObjectStoreForTests(store: ChatObjectStore | null) {
  testStore = store;
}

export function getChatObjectStore(): ChatObjectStore {
  if (testStore) return testStore;
  const driver = resolveChatStorageDriver();
  if (driver === "s3") {
    const config = readS3Config();
    if (!config) {
      throw badRequest("S3-хранилище не настроено");
    }
    return s3Store(config);
  }
  return localStore();
}

export async function putChatObject(
  key: string,
  bytes: Buffer,
  contentType: string
) {
  await getChatObjectStore().put(key, bytes, contentType);
}

export async function getChatObject(key: string): Promise<Buffer> {
  return getChatObjectStore().get(key);
}

export async function deleteChatObject(key: string) {
  await getChatObjectStore().delete(key);
}
