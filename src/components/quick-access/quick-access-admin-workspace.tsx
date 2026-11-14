"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, RefreshCw, Ban } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  QUICK_ACCESS_TYPES,
  type QuickAccessIssuedLink,
  type QuickAccessLinkView,
  type QuickAccessType,
} from "@/lib/quick-access";
import { apiPlatform, HttpStatusError } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type IssuedMap = Partial<Record<QuickAccessType, QuickAccessIssuedLink>>;

export function QuickAccessAdminWorkspace() {
  const [links, setLinks] = useState<QuickAccessLinkView[]>([]);
  const [issued, setIssued] = useState<IssuedMap>({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyType, setBusyType] = useState<QuickAccessType | null>(null);
  const [copiedType, setCopiedType] = useState<QuickAccessType | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiPlatform<{ links: QuickAccessLinkView[] }>(
        "listQuickAccessLinks"
      );
      setLinks(data.links);
      setReady(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Ошибка загрузки");
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial admin list load
    void load();
  }, [load]);

  async function runAction(
    accessType: QuickAccessType,
    action:
      | "createQuickAccessLink"
      | "reissueQuickAccessLink"
      | "disableQuickAccessLink"
  ) {
    setBusyType(accessType);
    try {
      if (action === "disableQuickAccessLink") {
        const data = await apiPlatform<{ link: QuickAccessLinkView }>(action, {
          accessType,
        });
        setLinks((prev) =>
          prev.map((row) =>
            row.accessType === accessType ? data.link : row
          )
        );
        setIssued((prev) => {
          const next = { ...prev };
          delete next[accessType];
          return next;
        });
        toast.success("Ссылка отключена");
      } else {
        const data = await apiPlatform<{ link: QuickAccessIssuedLink }>(
          action,
          { accessType }
        );
        setIssued((prev) => ({ ...prev, [accessType]: data.link }));
        setLinks((prev) =>
          prev.map((row) =>
            row.accessType === accessType
              ? {
                  ...row,
                  exists: true,
                  enabled: true,
                  createdAt: data.link.createdAt,
                  updatedAt: data.link.createdAt,
                  disabledAt: null,
                }
              : row
          )
        );
        toast.success(
          action === "createQuickAccessLink"
            ? "Ссылка создана — скопируйте её сейчас"
            : "Ссылка перевыпущена — скопируйте новый адрес"
        );
      }
    } catch (err) {
      const message =
        err instanceof HttpStatusError || err instanceof Error
          ? err.message
          : "Не удалось выполнить действие";
      toast.error(message);
    } finally {
      setBusyType(null);
    }
  }

  async function copyLink(accessType: QuickAccessType) {
    const link = issued[accessType];
    if (!link) {
      toast.error(
        "Исходный токен недоступен. Перевыпустите ссылку, чтобы скопировать."
      );
      return;
    }
    const absolute =
      link.url.startsWith("http")
        ? link.url
        : `${window.location.origin}${link.path}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopiedType(accessType);
      toast.success("Ссылка скопирована");
      setTimeout(() => setCopiedType(null), 1800);
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  if (!ready) {
    return (
      <div className="text-sm text-muted-foreground">Загрузка…</div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <EmptyState title="Не удалось загрузить" description={loadError} />
        <Button type="button" onClick={() => void load()}>
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Быстрый доступ"
        description="Секретные ссылки для заполнения таблиц с телефона без входа в кабинет. Токен показывается только при создании или перевыпуске."
      />

      <div className="space-y-3">
        {QUICK_ACCESS_TYPES.map((accessType) => {
          const row =
            links.find((l) => l.accessType === accessType) ??
            ({
              accessType,
              label: accessType,
              exists: false,
              enabled: false,
              createdAt: null,
              updatedAt: null,
              disabledAt: null,
              lastUsedAt: null,
            } satisfies QuickAccessLinkView);
          const fresh = issued[accessType];
          const busy = busyType === accessType;
          const statusLabel = !row.exists
            ? "Не создана"
            : row.enabled
              ? "Активна"
              : "Отключена";

          return (
            <section
              key={accessType}
              className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
                      {row.label}
                    </h2>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-medium",
                        !row.exists &&
                          "bg-muted text-muted-foreground",
                        row.exists &&
                          row.enabled &&
                          "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                        row.exists &&
                          !row.enabled &&
                          "bg-amber-500/15 text-amber-900 dark:text-amber-200"
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {fresh ? (
                    <p className="break-all rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs leading-relaxed">
                      {fresh.url.startsWith("http")
                        ? fresh.url
                        : fresh.path}
                    </p>
                  ) : row.exists ? (
                    <p className="text-sm text-muted-foreground">
                      Токен хранится только в виде хеша. Чтобы скопировать
                      ссылку, перевыпустите её.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Создайте ссылку, чтобы открывать таблицу с телефона без
                      логина.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {!row.exists || !row.enabled ? (
                    <Button
                      type="button"
                      disabled={busy}
                      className="min-h-11"
                      onClick={() =>
                        void runAction(
                          accessType,
                          row.exists
                            ? "reissueQuickAccessLink"
                            : "createQuickAccessLink"
                        )
                      }
                    >
                      <Link2 className="size-4" />
                      {row.exists ? "Включить / перевыпустить" : "Создать ссылку"}
                    </Button>
                  ) : null}

                  {row.exists && row.enabled ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy || !fresh}
                        className="min-h-11"
                        onClick={() => void copyLink(accessType)}
                      >
                        {copiedType === accessType ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        Копировать
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        className="min-h-11"
                        onClick={() =>
                          void runAction(accessType, "reissueQuickAccessLink")
                        }
                      >
                        <RefreshCw className="size-4" />
                        Перевыпустить
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        className="min-h-11"
                        onClick={() =>
                          void runAction(accessType, "disableQuickAccessLink")
                        }
                      >
                        <Ban className="size-4" />
                        Отключить
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
