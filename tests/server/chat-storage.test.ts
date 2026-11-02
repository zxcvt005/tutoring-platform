import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  deleteChatObject,
  getChatObject,
  putChatObject,
  resolveChatStorageDriver,
} from "@/server/media/chat-storage";

const KEYS = [
  "chats/org/chat/message/file.png",
  "theory/org/material/file.pdf",
  "intensive/org/intensive/file.pdf",
  "teachers/teacher.jpg",
];

describe("object storage", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    CHAT_STORAGE_DRIVER: process.env.CHAT_STORAGE_DRIVER,
    CHAT_UPLOAD_ROOT: process.env.CHAT_UPLOAD_ROOT,
    CHAT_STORAGE_ALLOW_LOCAL: process.env.CHAT_STORAGE_ALLOW_LOCAL,
  };
  let dir: string | undefined;

  afterEach(async () => {
    process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.CHAT_STORAGE_DRIVER === undefined) {
      delete process.env.CHAT_STORAGE_DRIVER;
    } else process.env.CHAT_STORAGE_DRIVER = previous.CHAT_STORAGE_DRIVER;
    if (previous.CHAT_UPLOAD_ROOT === undefined) {
      delete process.env.CHAT_UPLOAD_ROOT;
    } else process.env.CHAT_UPLOAD_ROOT = previous.CHAT_UPLOAD_ROOT;
    if (previous.CHAT_STORAGE_ALLOW_LOCAL === undefined) {
      delete process.env.CHAT_STORAGE_ALLOW_LOCAL;
    } else {
      process.env.CHAT_STORAGE_ALLOW_LOCAL = previous.CHAT_STORAGE_ALLOW_LOCAL;
    }
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("does not use the local disk in production", () => {
    expect(() =>
      resolveChatStorageDriver({
        NODE_ENV: "production",
        CHAT_STORAGE_DRIVER: "local",
        CHAT_STORAGE_ALLOW_LOCAL: "1",
      })
    ).toThrow(/S3_ENDPOINT/);
  });

  it("uses S3 in production when the bucket is configured", () => {
    expect(
      resolveChatStorageDriver({
        NODE_ENV: "production",
        CHAT_STORAGE_DRIVER: "local",
        S3_ENDPOINT: "https://s3.twcstorage.ru",
        S3_BUCKET: "bucket",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
      })
    ).toBe("s3");
  });

  it("stores and deletes chat, theory, intensive and teacher files", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "umba-files-"));
    process.env.NODE_ENV = "test";
    process.env.CHAT_STORAGE_DRIVER = "local";
    process.env.CHAT_UPLOAD_ROOT = dir;

    for (const key of KEYS) {
      await putChatObject(key, Buffer.from(key), "application/octet-stream");
      await expect(getChatObject(key)).resolves.toEqual(Buffer.from(key));
      await deleteChatObject(key);
      await expect(getChatObject(key)).rejects.toMatchObject({ status: 404 });
    }
  });

  it("rejects a key outside the allowed prefixes", async () => {
    process.env.NODE_ENV = "test";
    process.env.CHAT_STORAGE_DRIVER = "local";
    await expect(
      putChatObject("../secret.txt", Buffer.from("x"), "text/plain")
    ).rejects.toMatchObject({ status: 400 });
  });
});
