"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  apiCreateInvitation,
  apiGetInvitationAccess,
  apiRevokeInvitation,
  type InvitationAccessPayload,
  type InvitationAccessStatus,
} from "@/lib/store/api-client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<InvitationAccessStatus, string> = {
  unregistered: "Не зарегистрирован",
  invited: "Приглашение отправлено",
  activated: "Аккаунт активирован",
};

function absoluteInviteUrl(inviteUrl: string): string {
  if (inviteUrl.startsWith("http://") || inviteUrl.startsWith("https://")) {
    return inviteUrl;
  }
  if (typeof window === "undefined") return inviteUrl;
  return `${window.location.origin}${inviteUrl}`;
}

export function ProfileAccessPanel({
  teacherId,
  studentId,
  accountEmail,
  hasAccount,
  className,
}: {
  teacherId?: string;
  studentId?: string;
  /** Из bootstrap, пока статус не загрузился */
  accountEmail?: string | null;
  /** true, если профиль уже связан с users.id */
  hasAccount?: boolean;
  className?: string;
}) {
  const bootstrapActivated = Boolean(hasAccount || accountEmail);
  const [data, setData] = useState<InvitationAccessPayload | null>(
    bootstrapActivated
      ? {
          accessStatus: "activated",
          accountEmail: accountEmail ?? null,
          invitation: null,
        }
      : null
  );
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!bootstrapActivated);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const status = await apiGetInvitationAccess({ teacherId, studentId });
      setData(status);
      if (status.accessStatus !== "invited") {
        setLastInviteUrl(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить доступ"
      );
      // При ошибке API всё равно показываем действие по bootstrap-состоянию.
      if (!bootstrapActivated) {
        setData((prev) =>
          prev ?? {
            accessStatus: "unregistered",
            accountEmail: null,
            invitation: null,
          }
        );
      }
    } finally {
      setLoading(false);
    }
  }, [teacherId, studentId, bootstrapActivated]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const created = await apiCreateInvitation({ teacherId, studentId });
      setData(created);
      if (created.inviteUrl) {
        setLastInviteUrl(absoluteInviteUrl(created.inviteUrl));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать ссылку");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite() {
    if (!data?.invitation?.id) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const next = await apiRevokeInvitation(data.invitation.id);
      setData(next);
      setLastInviteUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отозвать ссылку");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  }

  const status: InvitationAccessStatus =
    data?.accessStatus ??
    (bootstrapActivated ? "activated" : "unregistered");
  const email =
    data?.accountEmail ??
    (status === "activated" ? accountEmail : null) ??
    null;

  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border border-border bg-background p-4 shadow-sm",
        className
      )}
      aria-label="Доступ в кабинет"
    >
      <div className="space-y-1">
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Доступ в кабинет
        </p>
        <p className="text-sm font-semibold">
          {STATUS_LABEL[status]}
          {loading && status === "unregistered" ? (
            <span className="ml-2 font-normal text-muted-foreground">
              · обновление…
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {status === "activated"
            ? "Пользователь может войти в свой кабинет."
            : status === "invited"
              ? "Передайте персональную ссылку. Она действует 7 дней и только один раз."
              : "Создайте одноразовую ссылку, чтобы человек зарегистрировал вход сам."}
        </p>
      </div>

      {email ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Почта входа: </span>
          <span className="font-medium">{email}</span>
        </p>
      ) : null}

      {data?.invitation && status === "invited" ? (
        <p className="text-xs text-muted-foreground">
          Действует до {formatDateTime(data.invitation.expiresAt)}
        </p>
      ) : null}

      {lastInviteUrl ? (
        <div className="space-y-2">
          <p className="break-all rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed">
            {lastInviteUrl}
          </p>
          <p className="text-xs text-muted-foreground">
            Ссылка показывается один раз. Скопируйте её до закрытия страницы.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {status !== "activated" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            className="h-10 w-full rounded-xl sm:w-auto"
            disabled={busy}
            onClick={() => void createInvite()}
          >
            {busy
              ? "Создание…"
              : status === "invited"
                ? "Создать новую ссылку"
                : "Создать ссылку-приглашение"}
          </Button>
          {lastInviteUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 w-full rounded-xl sm:w-auto"
              disabled={busy}
              onClick={() => void copyLink()}
            >
              {copied ? "Скопировано" : "Копировать ссылку"}
            </Button>
          ) : null}
          {status === "invited" && data?.invitation ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 w-full rounded-xl sm:w-auto"
              disabled={busy}
              onClick={() => void revokeInvite()}
            >
              Отозвать
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
