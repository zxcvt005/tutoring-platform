import { cabinetHomeForRole } from "@/lib/auth/cabinets";
import type { DemoData } from "@/lib/types";

export type ImpersonationAuth = {
  active: true;
  actorUserId: string;
  actorEmail: string;
  actorFullName: string;
};

export type BootstrapAuth = {
  userId: string;
  role: "director" | "teacher" | "student";
  organizationId: string;
  teacherId: string | null;
  studentId: string | null;
  fullName: string;
  email: string;
  impersonation?: ImpersonationAuth | null;
};

export { cabinetHomeForRole };

export type AuthFeatures = {
  demoLogin: boolean;
  needsBootstrap: boolean;
  production: boolean;
};

let csrfTokenCache: string | null = null;

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

export async function ensureCsrfToken(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;
  const res = await fetch("/api/auth/csrf", { credentials: "include" });
  const data = await parseJson<{ csrfToken: string }>(res);
  csrfTokenCache = data.csrfToken;
  return csrfTokenCache;
}

function clearCsrfCache() {
  csrfTokenCache = null;
}

async function mutatingHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const csrf = await ensureCsrfToken();
  return {
    "content-type": "application/json",
    "x-csrf-token": csrf,
    ...extra,
  };
}

export async function apiFeatures(): Promise<AuthFeatures> {
  const res = await fetch("/api/auth/features", { credentials: "include" });
  return parseJson(res);
}

export async function apiLogin(email: string, password: string) {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  return parseJson<{
    user: { id: string; email: string; fullName: string };
    organizationId: string;
    role: "director" | "teacher" | "student";
    teacherId: string | null;
    studentId: string | null;
  }>(res);
}

export async function apiLogout() {
  try {
    const headers = await mutatingHeaders();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers,
      credentials: "include",
      body: "{}",
    });
  } finally {
    clearCsrfCache();
  }
}

export async function apiDemoLogin(input: {
  role: "director" | "teacher" | "student";
  teacherId?: string;
  studentId?: string;
}) {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/auth/demo", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function apiBootstrapAdmin(input: {
  token: string;
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
  organizationSlug?: string;
}) {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/auth/bootstrap-admin", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(input),
  });
  clearCsrfCache();
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
  const headers = await mutatingHeaders(
    idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined
  );
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

export async function apiAdminUsers() {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  return parseJson<{
    users: {
      id: string;
      email: string;
      fullName: string;
      role: string;
      status: string;
    }[];
  }>(res);
}

export async function apiAdminCreateUser(body: {
  email: string;
  password: string;
  fullName: string;
  role: "director" | "teacher" | "student";
  teacherId?: string;
  studentId?: string;
}) {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function apiAdminPatchUser(
  id: string,
  body: { status?: "active" | "paused" | "disabled"; password?: string }
) {
  const headers = await mutatingHeaders();
  const res = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function apiRegisterTeacher(body: {
  fullName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone?: string;
  subjects?: string[];
  specializations?: string[];
}) {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/auth/register/teacher", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  clearCsrfCache();
  return parseJson<{
    user: { id: string; email: string; fullName: string };
    role: "teacher";
    teacherId: string | null;
  }>(res);
}

export async function apiRegisterStudent(body: {
  fullName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  contacts?: string;
}) {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/auth/register/student", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  clearCsrfCache();
  return parseJson<{
    user: { id: string; email: string; fullName: string };
    role: "student";
    studentId: string | null;
  }>(res);
}

export async function apiStartImpersonation(body: {
  userId?: string;
  teacherId?: string;
  studentId?: string;
}) {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/admin/impersonate", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  clearCsrfCache();
  return parseJson<{
    role: "director" | "teacher" | "student";
    redirectTo: string;
    impersonation: ImpersonationAuth | null;
  }>(res);
}

export async function apiStopImpersonation() {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/admin/impersonate/stop", {
    method: "POST",
    headers,
    credentials: "include",
    body: "{}",
  });
  clearCsrfCache();
  return parseJson<{
    role: "director" | "teacher" | "student";
    redirectTo: string;
  }>(res);
}
