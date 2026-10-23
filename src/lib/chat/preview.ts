import { CHAT_DELETED_PLACEHOLDER } from "@/lib/chat/constants";

export function chatMessagePreview(message: {
  deleted?: boolean;
  type?: string;
  body?: string | null;
  eventPayload?: { title?: string } | null;
  attachmentsCount?: number;
}): string {
  if (message.deleted) return CHAT_DELETED_PLACEHOLDER;
  if (message.type === "system_event") {
    return message.eventPayload?.title?.trim() || "Событие";
  }
  const text = message.body?.trim() ?? "";
  if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  if ((message.attachmentsCount ?? 0) > 0) return "Вложение";
  return "Сообщение";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} КБ`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} МБ`;
}

export function isFullySentMessage(result: {
  incomplete: boolean;
  attachmentErrors: unknown[];
}): boolean {
  return !result.incomplete && result.attachmentErrors.length === 0;
}

export function mergeChatMessages<T extends { id: string; createdAt: string }>(
  current: T[],
  incoming: T[]
): T[] {
  const map = new Map<string, T>();
  for (const m of current) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => {
    const t = a.createdAt.localeCompare(b.createdAt);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}
