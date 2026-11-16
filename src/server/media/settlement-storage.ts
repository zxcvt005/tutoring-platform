import {
  deleteChatObject,
  getChatObject,
  putChatObject,
} from "@/server/media/chat-storage";

export function settlementObjectKey(
  organizationId: string,
  documentId: string
): string {
  return `settlements/${organizationId}/${documentId}.pdf`;
}

export async function putSettlementPdf(
  key: string,
  bytes: Buffer
): Promise<void> {
  await putChatObject(key, bytes, "application/pdf");
}

export async function getSettlementPdf(key: string): Promise<Buffer> {
  return getChatObject(key);
}

export async function deleteSettlementPdf(key: string): Promise<void> {
  await deleteChatObject(key);
}
