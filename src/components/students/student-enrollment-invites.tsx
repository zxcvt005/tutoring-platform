"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { apiPlatform } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type EnrollmentRow = {
  studentId: string;
  invitationId: string | null;
  displayName: string;
  status:
    | "awaiting_registration"
    | "filling_profile"
    | "picking_schedule"
    | "completed";
  statusLabel: string;
  createdAt: string;
  expiresAt: string | null;
  inviteUrl: string | null;
  canCopyLink: boolean;
};

export type StudentEnrollmentInvitesHandle = {
  createInvite: () => Promise<void>;
  creating: boolean;
};

function absoluteInviteUrl(inviteUrl: string): string {
  if (inviteUrl.startsWith("http://") || inviteUrl.startsWith("https://")) {
    return inviteUrl;
  }
  if (typeof window === "undefined") return inviteUrl;
  return `${window.location.origin}${inviteUrl}`;
}

export const StudentEnrollmentInvites = forwardRef<
  StudentEnrollmentInvitesHandle,
  { className?: string; showInlineCreate?: boolean }
>(function StudentEnrollmentInvites(
  { className, showInlineCreate = false },
  ref
) {
  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdMeta, setCreatedMeta] = useState<{
    createdAt: string;
    statusLabel: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await apiPlatform<{ invitations: EnrollmentRow[] }>(
        "listStudentEnrollmentInvitations",
        {}
      );
      setRows(data.invitations ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось загрузить приглашения"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createInvite = useCallback(async () => {
    setCreating(true);
    setCopied(false);
    try {
      const created = await apiPlatform<{
        inviteUrl: string;
        createdAt: string;
        statusLabel: string;
      }>("createStudentEnrollmentInvitation", {});
      const url = absoluteInviteUrl(created.inviteUrl);
      setCreatedUrl(url);
      setCreatedMeta({
        createdAt: created.createdAt,
        statusLabel: created.statusLabel,
      });
      setDialogOpen(true);
      await reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось создать приглашение"
      );
    } finally {
      setCreating(false);
    }
  }, [reload]);

  useImperativeHandle(
    ref,
    () => ({
      createInvite,
      creating,
    }),
    [createInvite, creating]
  );

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  }

  const pending = rows.filter((r) => r.status !== "completed");
  const completed = rows.filter((r) => r.status === "completed");

  return (
    <section
      className={cn(
        "space-y-4 rounded-2xl border border-border/80 bg-card/40 p-4 sm:p-5",
        className
      )}
      aria-label="Приглашения учеников"
      data-testid="student-enrollment-invites"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Приглашения
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Самостоятельная регистрация по ссылке — без предварительного
            заполнения карточки. Незавершённые регистрации не попадают в список
            учеников.
          </p>
        </div>
        {showInlineCreate ? (
          <Button
            type="button"
            className="rounded-full"
            disabled={creating}
            onClick={() => void createInvite()}
            data-testid="invite-student-button-inline"
          >
            {creating ? "Создание…" : "Пригласить ученика"}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : pending.length === 0 && completed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Пока нет приглашений. Нажмите «Пригласить ученика», чтобы получить
          ссылку.
        </p>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                В процессе
              </p>
              <ul className="divide-y divide-border/70 rounded-xl border border-border/70 bg-background">
                {pending.map((row) => (
                  <li
                    key={row.studentId}
                    className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-medium">
                        {row.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.statusLabel}
                        {" · "}
                        создано {formatDateTime(row.createdAt)}
                        {row.expiresAt
                          ? ` · до ${formatDateTime(row.expiresAt)}`
                          : ""}
                      </p>
                    </div>
                    {row.canCopyLink && row.inviteUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 shrink-0 rounded-xl"
                        onClick={() =>
                          void copyText(absoluteInviteUrl(row.inviteUrl!))
                        }
                      >
                        Копировать ссылку
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {completed.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Завершённые
              </p>
              <ul className="divide-y divide-border/70 rounded-xl border border-border/60 bg-muted/20">
                {completed.map((row) => (
                  <li
                    key={row.studentId}
                    className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="truncate text-sm font-medium">
                      {row.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.statusLabel}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ссылка-приглашение</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Отправьте ссылку ученику любым удобным способом. Она одноразовая и
              действует 7 дней. Карточка появится в списке учеников после
              завершения регистрации.
            </p>
            {createdMeta ? (
              <p className="text-xs text-muted-foreground">
                {createdMeta.statusLabel}
                {" · "}
                {formatDateTime(createdMeta.createdAt)}
              </p>
            ) : null}
            {createdUrl ? (
              <p className="break-all rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed">
                {createdUrl}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Закрыть
            </Button>
            <Button
              type="button"
              disabled={!createdUrl}
              onClick={() => createdUrl && void copyText(createdUrl)}
            >
              {copied ? "Скопировано" : "Копировать ссылку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
});
