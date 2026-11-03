import { randomBytes } from "node:crypto";

import { extForMime } from "@/lib/chat/file-sniff";
import type { QuestionImageMime } from "@/lib/tests/question-image";
import {
  deleteChatObject,
  getChatObject,
  putChatObject,
} from "@/server/media/chat-storage";

export function testQuestionObjectKey(
  organizationId: string,
  testId: string,
  questionId: string,
  mime: QuestionImageMime
): string {
  const id = randomBytes(8).toString("hex");
  return `questions/${organizationId}/${testId}/${questionId}/${id}${extForMime(mime)}`;
}

export async function putTestQuestionObject(
  key: string,
  bytes: Buffer,
  contentType: QuestionImageMime
) {
  await putChatObject(key, bytes, contentType);
}

export async function getTestQuestionObject(key: string): Promise<Buffer> {
  return getChatObject(key);
}

export async function deleteTestQuestionObject(key: string) {
  await deleteChatObject(key);
}
