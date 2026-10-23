import { randomBytes } from "node:crypto";

import { extForMime, safeOriginalName } from "@/lib/chat/file-sniff";
import type { TheoryAllowedMime } from "@/lib/theory/constants";
import {
  deleteChatObject,
  getChatObject,
  putChatObject,
} from "@/server/media/chat-storage";

export function theoryObjectKey(
  organizationId: string,
  materialId: string,
  mime: TheoryAllowedMime
): string {
  const id = randomBytes(8).toString("hex");
  return `theory/${organizationId}/${materialId}/${id}${extForMime(mime)}`;
}

export async function putTheoryObject(
  key: string,
  bytes: Buffer,
  contentType: string
) {
  await putChatObject(key, bytes, contentType);
}

export async function getTheoryObject(key: string): Promise<Buffer> {
  return getChatObject(key);
}

export async function deleteTheoryObject(key: string) {
  await deleteChatObject(key);
}

export { safeOriginalName };
