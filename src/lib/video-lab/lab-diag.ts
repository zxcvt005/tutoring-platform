/**
 * Диагностика видеолаборатории. Без токенов, секретов и полных IP.
 */

export type LabDiagEvent = {
  slot: "A" | "B" | "student" | "unknown";
  active: "A" | "B" | null;
  phase: string;
  connection?: string;
  signaling?: string;
  mic?: boolean;
  camera?: boolean;
  transportMode?: "auto" | "relay";
  ice?: string;
  dtls?: string;
  packetsSent?: number;
  message?: string;
};

export function redactLabText(text: string): string {
  return text
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[token]")
    .replace(/\b(?:turns?|stuns?):\/\/[^\s,;]+/gi, "[ice-url]")
    .replace(/\b(?:turns?|stuns?):[^\s,;]+/gi, "[ice-url]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[addr]");
}

export function labDiag(event: LabDiagEvent): void {
  const payload = {
    t: new Date().toISOString(),
    slot: event.slot,
    active: event.active,
    phase: event.phase,
    connection: event.connection,
    signaling: event.signaling,
    mic: event.mic,
    camera: event.camera,
    transportMode: event.transportMode,
    ice: event.ice ? redactLabText(event.ice) : undefined,
    dtls: event.dtls,
    packetsSent: event.packetsSent,
    message: event.message ? redactLabText(event.message).slice(0, 180) : undefined,
  };
  console.info("[video-lab]", payload);
}

export function labDiagErrorMessage(
  slot: LabDiagEvent["slot"],
  err: unknown
): string {
  const raw = err instanceof Error && err.message ? err.message : "Неизвестная ошибка соединения";
  return `[комната ${slot}] ${raw}`;
}
