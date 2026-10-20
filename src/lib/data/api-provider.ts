import type {
  AssignmentView,
  DataProvider,
  SessionUser,
} from "@/lib/data/types";

type ErrorBody = { error?: { message?: string } };

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string }
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (init?.idempotencyKey) {
    headers.set("idempotency-key", init.idempotencyKey);
  }

  const res = await fetch(path, { ...init, headers, credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as T & ErrorBody;
  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

/** HTTP-реализация DataProvider. Не подключать к UI до готовности cutover. */
export function createApiDataProvider(
  baseUrl = ""
): DataProvider {
  const root = baseUrl.replace(/\/$/, "");

  return {
    mode: "api",

    async login(email, password) {
      const data = await apiFetch<{
        user: { id: string; email: string; fullName: string };
        organizationId: string;
        role: SessionUser["role"];
        teacherId: string | null;
        studentId: string | null;
      }>(`${root}/api/auth/login`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      return {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.fullName,
        organizationId: data.organizationId,
        role: data.role,
        teacherId: data.teacherId,
        studentId: data.studentId,
      };
    },

    async logout() {
      await apiFetch(`${root}/api/auth/logout`, { method: "POST" });
    },

    async me() {
      try {
        return await apiFetch<SessionUser>(`${root}/api/auth/me`);
      } catch {
        return null;
      }
    },

    async getAssignment(id) {
      return apiFetch<AssignmentView>(`${root}/api/assignments/${id}`);
    },

    async saveAssignmentDraft(id, answers) {
      return apiFetch(`${root}/api/assignments/${id}/draft`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
    },

    async submitAssignment(id, answers, idempotencyKey) {
      return apiFetch(`${root}/api/assignments/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers }),
        idempotencyKey,
      });
    },

    async reviewAssignment(id, updates, overallFeedback, idempotencyKey) {
      return apiFetch(`${root}/api/assignments/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ updates, overallFeedback }),
        idempotencyKey,
      });
    },

    async getTest(id) {
      return apiFetch(`${root}/api/tests/${id}`);
    },
  };
}
