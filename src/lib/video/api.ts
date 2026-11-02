import { ensureCsrfToken, HttpStatusError } from "@/lib/store/api-client";
import type {
  VideoCallMode,
  VideoCallView,
  VideoCallSummary,
  VideoInviteCandidate,
  VideoLivekitToken,
} from "@/lib/video/types";

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

export async function apiVideoCallList() {
  const res = await fetch("/api/video/calls", { credentials: "include" });
  return parseJson<{ calls: VideoCallSummary[] }>(res);
}

export async function apiVideoCallCreate(mode: VideoCallMode) {
  const res = await fetch("/api/video/calls", {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: JSON.stringify({ mode }),
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiVideoCallGet(id: string) {
  const res = await fetch(`/api/video/calls/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiVideoCallInvite(id: string, studentIds: string[]) {
  const res = await fetch(`/api/video/calls/${encodeURIComponent(id)}/invite`, {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: JSON.stringify({ studentIds }),
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiVideoCallCandidates(id: string, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  const qs = params.toString();
  const res = await fetch(
    `/api/video/calls/${encodeURIComponent(id)}/candidates${qs ? `?${qs}` : ""}`,
    { credentials: "include" }
  );
  return parseJson<{ candidates: VideoInviteCandidate[] }>(res);
}

export async function apiVideoCallHold(id: string) {
  const res = await fetch(`/api/video/calls/${encodeURIComponent(id)}/hold`, {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiVideoCallActivate(id: string, participantId: string) {
  const res = await fetch(
    `/api/video/calls/${encodeURIComponent(id)}/activate`,
    {
      method: "POST",
      credentials: "include",
      headers: await mutatingHeaders(),
      body: JSON.stringify({ participantId }),
    }
  );
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiVideoCallCloseParticipant(
  id: string,
  participantId: string
) {
  const res = await fetch(
    `/api/video/calls/${encodeURIComponent(id)}/close-participant`,
    {
      method: "POST",
      credentials: "include",
      headers: await mutatingHeaders(),
      body: JSON.stringify({ participantId }),
    }
  );
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiVideoCallEnd(id: string) {
  const res = await fetch(`/api/video/calls/${encodeURIComponent(id)}/end`, {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ call: VideoCallView }>(res);
}

export async function apiVideoCallTokens(id: string) {
  const res = await fetch(`/api/video/calls/${encodeURIComponent(id)}/tokens`, {
    method: "POST",
    credentials: "include",
    headers: await mutatingHeaders(),
    body: "{}",
  });
  return parseJson<{ tokens: VideoLivekitToken[] }>(res);
}
