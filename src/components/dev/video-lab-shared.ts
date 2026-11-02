import { ConnectionState } from "livekit-client";

import { ensureCsrfToken, HttpStatusError } from "@/lib/store/api-client";


export { deviceErrorMessage } from "@/lib/video/device-error";

export const LAB_ROOM_A = "student-a";
export const LAB_ROOM_B = "student-b";

export type LabRole = "student" | "student-a" | "student-b" | "teacher";

export type LabStatus = {
  configured: boolean;
  missing: string[];
};

export type LabTokenResponse = {
  serverUrl: string;
  participantToken: string;
  roomName: string;
  identity: string;
};

export const STATE_LABEL: Record<ConnectionState, string> = {
  [ConnectionState.Disconnected]: "Отключено",
  [ConnectionState.Connecting]: "Подключение…",
  [ConnectionState.Connected]: "Подключено",
  [ConnectionState.Reconnecting]: "Переподключение…",
  [ConnectionState.SignalReconnecting]: "Переподключение сигнала…",
};

export function parseLabRole(value: string | null): LabRole {
  if (
    value === "teacher" ||
    value === "student-a" ||
    value === "student-b" ||
    value === "student"
  ) {
    return value;
  }
  return "student";
}

export {
  parseLabTransportMode,
  type LabTransportMode,
} from "@/lib/video-lab/lab-connect";

export function randomSuffix(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fetchLabToken(input: {
  roomName: string;
  identity: string;
  displayName: string;
}): Promise<LabTokenResponse> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/video/lab-token", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as LabTokenResponse & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new HttpStatusError(
      res.status,
      data.error?.message || `HTTP ${res.status}`
    );
  }
  return data;
}

export async function fetchLabStatus(): Promise<LabStatus> {
  const res = await fetch("/api/video/lab-status", {
    credentials: "include",
  });
  if (res.status === 404) {
    throw new Error("Страница доступна только при локальной разработке.");
  }
  const data = (await res.json()) as LabStatus & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
  return data;
}
