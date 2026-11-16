"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_COOKIE_PREFS,
  needsCookieDecision,
  readLegalClientPrefs,
  writeLegalClientPrefs,
  type CookieCategoryPrefs,
  type LegalClientPrefs,
} from "@/lib/legal/client-prefs";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { recordClientConsents } from "@/lib/legal/record-client-consents";
import { syncOptionalTrackers } from "@/lib/legal/trackers";
import { cn } from "@/lib/utils";

type PanelMode = "banner" | "settings";

async function persistCookiePrefs(
  cookie: CookieCategoryPrefs,
  source: "cookie_banner" | "cookie_settings"
) {
  await recordClientConsents({
    source,
    cookie: {
      analytics: cookie.analytics,
      marketing: cookie.marketing,
    },
  });
}

function saveCookieDecision(
  cookie: CookieCategoryPrefs,
  source: "cookie_banner" | "cookie_settings"
) {
  const prev = readLegalClientPrefs();
  const next: LegalClientPrefs = {
    ...prev,
    cookie: { ...cookie, necessary: true },
    cookieDecidedAt: new Date().toISOString(),
  };
  writeLegalClientPrefs(next);
  syncOptionalTrackers(next);
  void persistCookiePrefs(next.cookie!, source);
}

export function CookieNotice() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<PanelMode>("banner");
  const [draft, setDraft] = useState<CookieCategoryPrefs>({
    ...DEFAULT_COOKIE_PREFS,
  });

  useEffect(() => {
    const prefs = readLegalClientPrefs();
    setOpen(needsCookieDecision(prefs));
    if (prefs.cookie) setDraft({ ...prefs.cookie, necessary: true });
    setReady(true);
    syncOptionalTrackers(prefs);

    function onPrefs() {
      const next = readLegalClientPrefs();
      setOpen(needsCookieDecision(next));
      if (next.cookie) setDraft({ ...next.cookie, necessary: true });
    }
    function onOpenSettings() {
      const current = readLegalClientPrefs();
      setDraft(
        current.cookie
          ? { ...current.cookie, necessary: true }
          : { ...DEFAULT_COOKIE_PREFS }
      );
      setMode("settings");
      setOpen(true);
    }
    window.addEventListener("neodin:legal-prefs", onPrefs);
    window.addEventListener("neodin:open-cookie-settings", onOpenSettings);
    return () => {
      window.removeEventListener("neodin:legal-prefs", onPrefs);
      window.removeEventListener("neodin:open-cookie-settings", onOpenSettings);
    };
  }, []);

  if (!ready || !open) return null;

  const privacyPath = LEGAL_DOCUMENTS["privacy-policy"].path;

  function acceptAll() {
    saveCookieDecision(
      { necessary: true, analytics: true, marketing: true },
      mode === "settings" ? "cookie_settings" : "cookie_banner"
    );
    setOpen(false);
    setMode("banner");
  }

  function acceptNecessaryOnly() {
    saveCookieDecision(
      { ...DEFAULT_COOKIE_PREFS },
      mode === "settings" ? "cookie_settings" : "cookie_banner"
    );
    setOpen(false);
    setMode("banner");
  }

  function saveSettings() {
    saveCookieDecision({ ...draft, necessary: true }, "cookie_settings");
    setOpen(false);
    setMode("banner");
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-notice-title"
        className="pointer-events-auto w-full max-w-lg rounded-2xl border border-[color:oklch(0.82_0.03_300)] bg-[color:var(--panel-soft,#fffdf9)] px-4 py-3.5 shadow-[0_12px_40px_-18px_rgba(80,60,90,0.35)] sm:px-5"
      >
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Неодин
        </p>
        <p
          id="cookie-notice-title"
          className="mt-1 font-display text-base font-semibold tracking-tight"
        >
          {mode === "settings" ? "Настройки Cookie" : "Уведомление о Cookie"}
        </p>

        {mode === "banner" ? (
          <>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
              Сайт использует технологии Cookie для работы входа и безопасности.
              Яндекс.Метрика и другие сторонние аналитические сервисы в текущей
              версии не подключены. Подробности — в{" "}
              <Link
                href={privacyPath}
                className="font-medium text-[color:oklch(0.45_0.06_300)] underline-offset-2 hover:underline"
              >
                Политике обработки персональных данных
              </Link>
              .
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl px-3"
                onClick={() => setMode("settings")}
              >
                Настройки
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl px-3"
                  onClick={acceptNecessaryOnly}
                >
                  Только необходимые
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-xl px-4"
                  onClick={acceptAll}
                >
                  Принять все
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
              Необходимые cookie всегда включены. Необязательные категории
              подготовлены на будущее: пока сторонние трекеры не запускаются без
              вашего согласия.
            </p>
            <ul className="mt-3 space-y-2.5">
              <CategoryRow
                title="Необходимые"
                description="Сессия входа, безопасность, работа кабинетов."
                checked
                locked
              />
              <CategoryRow
                title="Аналитические"
                description="Яндекс.Метрика сейчас не подключена."
                checked={draft.analytics}
                onChange={(analytics) => setDraft((d) => ({ ...d, analytics }))}
              />
              <CategoryRow
                title="Маркетинговые"
                description="Маркетинговые трекеры сейчас не подключены."
                checked={draft.marketing}
                onChange={(marketing) => setDraft((d) => ({ ...d, marketing }))}
              />
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl px-3"
                onClick={() => setMode("banner")}
              >
                Назад
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl px-3"
                  onClick={acceptNecessaryOnly}
                >
                  Только необходимые
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-xl px-4"
                  onClick={saveSettings}
                >
                  Сохранить
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  title,
  description,
  checked,
  locked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border/50 bg-white/70 px-3 py-2.5"
      )}
    >
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 rounded border-border"
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-label={title}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </li>
  );
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("neodin:open-cookie-settings"));
}
