import { ensureCsrfToken, HttpStatusError } from "@/lib/store/api-client";
import type { VideoCallView, VideoLivekitToken } from "@/lib/video/types";

export type PrivateHostSnapshot = {
  id: string;
  code: string;
  accepting: boolean;
  call: Extract<VideoCallView, { role: "teacher" }>;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {
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

async function mutatingHeaders(): Promise<Record<string, string>> {
  const csrf = await ensureCsrfToken();
  return {
    "content-type": "application/json",
    "x-csrf-token": csrf,
  };
}

export async function apiPrivateLogin(password: string) {
  const res = await fetch("/api/private-calls/login", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: JSON.stringify({ password }),
  });
  return parseJson<{ ok: true }>(res);
}

export async function apiPrivateLogout() {
  const res = await fetch("/api/private-calls/logout", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ ok: true }>(res);
}

export async function apiPrivateHostGet() {
  const res = await fetch("/api/private-calls/session", {
    credentials: "include",
  });
  return parseJson<{ session: PrivateHostSnapshot | null }>(res);
}

export async function apiPrivateStart() {
  const res = await fetch("/api/private-calls/session", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ session: PrivateHostSnapshot }>(res);
}

export async function apiPrivateAccepting(accepting: boolean) {
  const res = await fetch("/api/private-calls/session/accepting", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: JSON.stringify({ accepting }),
  });
  return parseJson<{ session: PrivateHostSnapshot }>(res);
}

export async function apiPrivateHold() {
  const res = await fetch("/api/private-calls/session/hold", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiPrivateActivate(participantId: string) {
  const res = await fetch("/api/private-calls/session/activate", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: JSON.stringify({ participantId }),
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiPrivateClose(participantId: string) {
  const res = await fetch("/api/private-calls/session/close-participant", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: JSON.stringify({ participantId }),
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiPrivateEnd() {
  const res = await fetch("/api/private-calls/session/end", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiPrivateHostTokens() {
  const res = await fetch("/api/private-calls/session/tokens", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ tokens: VideoLivekitToken[] }>(res);
}

export async function apiPrivateJoinInfo(code: string) {
  const res = await fetch(`/api/private-calls/join/${encodeURIComponent(code)}`, {
    credentials: "include",
  });
  return parseJson<{ available: boolean; accepting: boolean }>(res);
}

export async function apiPrivateJoin(code: string, name: string) {
  const res = await fetch(`/api/private-calls/join/${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: JSON.stringify({ name }),
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiPrivateGuest() {
  const res = await fetch("/api/private-calls/guest", { credentials: "include" });
  return parseJson<{
    joined: boolean;
    call: Extract<VideoCallView, { role: "student" }> | null;
  }>(res);
}

export async function apiPrivateGuestTokens() {
  const res = await fetch("/api/private-calls/guest/tokens", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ tokens: VideoLivekitToken[] }>(res);
}

export async function apiPrivatePulse() {
  const res = await fetch("/api/private-calls/guest/heartbeat", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ ok: true }>(res);
}

export async function apiPrivateLeave() {
  const res = await fetch("/api/private-calls/guest/leave", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ ok: true }>(res);
}
