import type { DemoData } from "@/lib/types";

export type BootstrapAuth = {
  userId: string;
  role: "director" | "teacher" | "student";
  organizationId: string;
  teacherId: string | null;
  studentId: string | null;
  fullName: string;
  email: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

export async function apiDemoLogin(input: {
  role: "director" | "teacher" | "student";
  teacherId?: string;
  studentId?: string;
}) {
  const res = await fetch("/api/auth/demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function apiBootstrap(): Promise<{
  data: DemoData;
  auth: BootstrapAuth;
}> {
  const res = await fetch("/api/bootstrap", { credentials: "include" });
  return parseJson(res);
}

export async function apiPlatform<T = unknown>(
  action: string,
  payload?: unknown,
  idempotencyKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await fetch("/api/platform", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ action, payload }),
  });
  return parseJson(res);
}

export async function apiMe() {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  return parseJson(res);
}
