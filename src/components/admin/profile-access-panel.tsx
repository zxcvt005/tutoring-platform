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
}: {
  teacherId?: string;
  studentId?: string;
  /** Из bootstrap, пока статус не загрузился */
  accountEmail?: string | null;
}) {
  const [data, setData] = useState<InvitationAccessPayload | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      setError(err instanceof Error ? err.message : "Не удалось загрузить доступ");
    }
  }, [teacherId, studentId]);

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

  const status = data?.accessStatus;
  const email =
    data?.accountEmail ??
    (status === "activated" ? accountEmail : null) ??
    null;

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div>
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Доступ в кабинет
        </p>
        <p className="mt-1 text-sm font-medium">
          {status ? STATUS_LABEL[status] : "Загрузка…"}
        </p>
      </div>

      {email ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Почта входа: </span>
          {email}
        </p>
      ) : null}

      {data?.invitation && status === "invited" ? (
        <p className="text-xs text-muted-foreground">
          Действует до {formatDateTime(data.invitation.expiresAt)}
        </p>
      ) : null}

      {lastInviteUrl ? (
        <div className="space-y-2">
          <p className="break-all rounded-lg bg-background/80 px-3 py-2 font-mono text-xs">
            {lastInviteUrl}
          </p>
          <p className="text-xs text-muted-foreground">
            Ссылка показывается один раз. Сохраните её до передачи.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "unregistered" || status === "invited" ? (
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            disabled={busy}
            onClick={() => void createInvite()}
          >
            {status === "invited"
              ? "Создать новую ссылку"
              : "Создать ссылку-приглашение"}
          </Button>
        ) : null}
        {lastInviteUrl ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
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
            className="rounded-xl"
            disabled={busy}
            onClick={() => void revokeInvite()}
          >
            Отозвать
          </Button>
        ) : null}
      </div>
    </div>
  );
}
