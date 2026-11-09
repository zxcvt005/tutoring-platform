import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { badRequest, notFound } from "@/server/errors";
import {
  normalizeS3Endpoint,
  s3Delete,
  s3Get,
  s3Put,
  type S3Config,
} from "@/server/media/s3";

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
    !/^(chats|chat-pending|theory|theory-pending|intensive|intensive-pending|teachers|questions)\//.test(
      normalized
    ) ||
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

function readS3ConfigFrom(
  env: NodeJS.ProcessEnv = process.env
): S3Config | null {
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  const endpoint = env.S3_ENDPOINT?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;
  // Timeweb и совместимые S3: path-style по умолчанию (`https://s3…/bucket/key`).
  // Virtual-hosted (`bucket.s3…`) часто даёт 404/NoSuchBucket на приватных бакетах.
  const forceRaw = env.S3_FORCE_PATH_STYLE?.trim().toLowerCase();
  const forcePathStyle = !(forceRaw === "0" || forceRaw === "false");
  const { origin, discardedPathSegments } = normalizeS3Endpoint(endpoint);
  if (discardedPathSegments > 0) {
    console.error(
      "S3_ENDPOINT contains a path; using origin only. Put the bucket name in S3_BUCKET.",
      { discardedPathSegments, endpointHost: new URL(origin).host }
    );
  }
  return {
    endpoint: origin,
    region: env.S3_REGION?.trim() || "ru-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  };
}

function requestedDriverFrom(
  env: NodeJS.ProcessEnv = process.env
): "s3" | "local" | "auto" {
  const raw = (env.CHAT_STORAGE_DRIVER ?? "auto").trim().toLowerCase();
  if (raw === "s3" || raw === "local") return raw;
  return "auto";
}

function missingS3Message(): string {
  return "Хранилище файлов не настроено. Задайте S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID и S3_SECRET_ACCESS_KEY.";
}

export function resolveChatStorageDriver(
  env: NodeJS.ProcessEnv = process.env
): "s3" | "local" {
  const requested = requestedDriverFrom(env);
  const s3 = readS3ConfigFrom(env);
  if (env.NODE_ENV === "production") {
    if (!s3) throw badRequest(missingS3Message());
    return "s3";
  }
  if (requested === "s3") {
    if (!s3) throw badRequest(missingS3Message());
    return "s3";
  }
  if (requested === "local") return "local";
  if (s3) return "s3";
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
    const config = readS3ConfigFrom();
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
