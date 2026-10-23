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

export type DemoAccountOption = {
  id: string;
  role: "director" | "teacher" | "student";
  fullName: string;
  email: string;
  teacherId?: string;
  studentId?: string;
  href: string;
  group: "director" | "teachers" | "students";
  note?: string;
};

export type AuthFeatures = {
  demoLogin: boolean;
  needsBootstrap: boolean;
  production: boolean;
  demoAccounts?: DemoAccountOption[];
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
  email?: string;
}) {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/auth/demo", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{
    user: { id: string; email: string; fullName: string };
    organizationId: string;
    role: "director" | "teacher" | "student";
    teacherId: string | null;
    studentId: string | null;
  }>(res);
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

export async function apiTheoryUploadFile(materialId: string, file: File) {
  const headers = await csrfOnlyHeaders();
  const form = new FormData();
  form.append("files", file);
  const res = await fetch(
    `/api/theory/${encodeURIComponent(materialId)}/files`,
    {
      method: "POST",
      headers,
      credentials: "include",
      body: form,
    }
  );
  return parseJson<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>(res);
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

async function csrfOnlyHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const csrf = await ensureCsrfToken();
  return { "x-csrf-token": csrf, ...extra };
}

export async function apiNotesList() {
  const res = await fetch("/api/notes", { credentials: "include" });
  return parseJson<import("@/lib/notes/types").NotesListResponse>(res);
}

export async function apiNotesCreate() {
  const headers = await mutatingHeaders();
  const res = await fetch("/api/notes", {
    method: "POST",
    headers,
    credentials: "include",
    body: "{}",
  });
  return parseJson<{ note: import("@/lib/notes/types").UserNoteView }>(res);
}

export async function apiNotesUpdate(
  id: string,
  body: { title?: string; content?: string }
) {
  const headers = await mutatingHeaders();
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  return parseJson<{ note: import("@/lib/notes/types").UserNoteView }>(res);
}

export async function apiNotesDelete(id: string) {
  const headers = await mutatingHeaders();
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
    credentials: "include",
    body: "{}",
  });
  return parseJson<{ ok: true }>(res);
}

export async function apiChatList(input: { query?: string; offset?: number } = {}) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.offset) params.set("offset", String(input.offset));
  const qs = params.toString();
  const res = await fetch(`/api/chats${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  return parseJson<import("@/lib/chat/types").ChatListResponse>(res);
}

export async function apiChatSummary() {
  const res = await fetch("/api/chats/summary", { credentials: "include" });
  return parseJson<import("@/lib/chat/types").ChatSummary>(res);
}

export async function apiChatMessages(
  chatId: string,
  input: { before?: string; beforeId?: string; limit?: number } = {}
) {
  const params = new URLSearchParams();
  if (input.before) params.set("before", input.before);
  if (input.beforeId) params.set("beforeId", input.beforeId);
  if (input.limit) params.set("limit", String(input.limit));
  const qs = params.toString();
  const res = await fetch(
    `/api/chats/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ""}`,
    { credentials: "include" }
  );
  return parseJson<import("@/lib/chat/types").ChatMessagesResponse>(res);
}

export async function apiChatSend(
  chatId: string,
  input: { body?: string; clientRequestId: string; files?: File[] }
) {
  const headers = await csrfOnlyHeaders();
  let res: Response;
  if (input.files && input.files.length > 0) {
    const form = new FormData();
    form.set("body", input.body ?? "");
    form.set("clientRequestId", input.clientRequestId);
    for (const file of input.files) form.append("files", file);
    res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
      method: "POST",
      headers,
      credentials: "include",
      body: form,
    });
  } else {
    res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        body: input.body,
        clientRequestId: input.clientRequestId,
      }),
    });
  }
  return parseJson<import("@/lib/chat/types").ChatSendResult>(res);
}

export async function apiChatRetryAttachments(
  chatId: string,
  messageId: string,
  files: File[]
) {
  const headers = await csrfOnlyHeaders();
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/attachments`,
    {
      method: "POST",
      headers,
      credentials: "include",
      body: form,
    }
  );
  return parseJson<import("@/lib/chat/types").ChatSendResult>(res);
}

export async function apiChatEdit(
  chatId: string,
  messageId: string,
  body: string
) {
  const headers = await mutatingHeaders();
  const res = await fetch(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers,
      credentials: "include",
      body: JSON.stringify({ body }),
    }
  );
  return parseJson<{ message: import("@/lib/chat/types").ChatMessageView }>(res);
}

export async function apiChatDelete(chatId: string, messageId: string) {
  const headers = await mutatingHeaders();
  const res = await fetch(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
      headers,
      credentials: "include",
      body: "{}",
    }
  );
  return parseJson<{ message: import("@/lib/chat/types").ChatMessageView }>(res);
}

export async function apiChatMarkRead(chatId: string, messageId: string) {
  const headers = await mutatingHeaders();
  const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/read`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ messageId }),
  });
  return parseJson<{ ok: true; unreadCount: number }>(res);
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
