import type { ConsentSource } from "@/lib/legal/documents";

/** Запись согласий с клиента (с CSRF). Ошибки глотаются — UX формы не ломаем после успеха основной операции, но для pre-check вызывайте отдельно. */
export async function recordClientConsents(input: {
  source: ConsentSource;
  privacyAck?: boolean;
  personalData?: boolean;
  marketing?: boolean | null;
  publicOffer?: boolean;
  cookie?: { analytics: boolean; marketing: boolean } | null;
  siteLeadId?: string | null;
  contactRaw?: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const csrfRes = await fetch("/api/auth/csrf", { credentials: "include" });
    const csrfJson = (await csrfRes.json().catch(() => null)) as {
      csrfToken?: string;
    } | null;
    const csrfToken = csrfJson?.csrfToken?.trim();
    if (!csrfRes.ok || !csrfToken) {
      return { ok: false, message: "Не удалось сохранить согласие (CSRF)" };
    }
    const res = await fetch("/api/legal/consents", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return {
        ok: false,
        message: json?.error?.message ?? "Не удалось сохранить согласие",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Нет связи при сохранении согласия" };
  }
}
