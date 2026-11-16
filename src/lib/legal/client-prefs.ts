import {
  LEGAL_CLIENT_STORAGE_KEY,
  LEGAL_DOCUMENTS,
  type LegalDocumentSlug,
} from "@/lib/legal/documents";

export type CookieCategoryPrefs = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export type LegalClientPrefs = {
  /** Ознакомление с политикой (не равно согласию на обработку в форме). */
  privacyAckVersion: string | null;
  privacyAckAt: string | null;
  cookie: CookieCategoryPrefs | null;
  cookieDecidedAt: string | null;
  firstVisitDismissedAt: string | null;
};

export const DEFAULT_COOKIE_PREFS: CookieCategoryPrefs = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export function emptyLegalClientPrefs(): LegalClientPrefs {
  return {
    privacyAckVersion: null,
    privacyAckAt: null,
    cookie: null,
    cookieDecidedAt: null,
    firstVisitDismissedAt: null,
  };
}

export function readLegalClientPrefs(): LegalClientPrefs {
  if (typeof window === "undefined") return emptyLegalClientPrefs();
  try {
    const raw = window.localStorage.getItem(LEGAL_CLIENT_STORAGE_KEY);
    if (!raw) return emptyLegalClientPrefs();
    const parsed = JSON.parse(raw) as Partial<LegalClientPrefs>;
    return {
      ...emptyLegalClientPrefs(),
      ...parsed,
      cookie: parsed.cookie
        ? {
            necessary: true,
            analytics: Boolean(parsed.cookie.analytics),
            marketing: Boolean(parsed.cookie.marketing),
          }
        : null,
    };
  } catch {
    return emptyLegalClientPrefs();
  }
}

export function writeLegalClientPrefs(next: LegalClientPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEGAL_CLIENT_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("neodin:legal-prefs"));
}

export function needsPrivacyReack(prefs: LegalClientPrefs): boolean {
  const current = LEGAL_DOCUMENTS["privacy-policy"].version;
  return prefs.privacyAckVersion !== current;
}

export function needsCookieDecision(prefs: LegalClientPrefs): boolean {
  return prefs.cookie == null || prefs.cookieDecidedAt == null;
}

export function needsFirstVisitNotice(prefs: LegalClientPrefs): boolean {
  if (prefs.firstVisitDismissedAt && !needsPrivacyReack(prefs)) return false;
  return needsPrivacyReack(prefs);
}

export function documentVersion(slug: LegalDocumentSlug): string {
  return LEGAL_DOCUMENTS[slug].version;
}

/** Фактически подключенных необязательных трекеров в коде сейчас нет. */
export function optionalTrackersAllowed(prefs: LegalClientPrefs): {
  analytics: boolean;
  marketing: boolean;
} {
  return {
    analytics: Boolean(prefs.cookie?.analytics),
    marketing: Boolean(prefs.cookie?.marketing),
  };
}
