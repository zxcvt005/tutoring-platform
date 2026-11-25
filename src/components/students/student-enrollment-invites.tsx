"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";
import { apiPlatform } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type EnrollmentRow = {
  studentId: string;
  invitationId: string | null;
  displayName: string;
  inviteLabel: string | null;
  hidden: boolean;
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
  const creatingRef = useRef(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdMeta, setCreatedMeta] = useState<{
    createdAt: string;
    statusLabel: string;
    displayName: string;
  } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [inviteLabelDraft, setInviteLabelDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);

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

  const openCompose = useCallback(async () => {
    setInviteLabelDraft("");
    setCopied(false);
    setCreatedUrl(null);
    setCreatedMeta(null);
    setComposeOpen(true);
  }, []);

  const submitCreate = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setCopied(false);
    const idem =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `enrollment-invite-${Date.now()}`;
    try {
      const created = await apiPlatform<{
        inviteUrl: string;
        createdAt: string;
        statusLabel: string;
        displayName: string;
      }>(
        "createStudentEnrollmentInvitation",
        { inviteLabel: inviteLabelDraft.trim() || null },
        idem
      );
      const url = absoluteInviteUrl(created.inviteUrl);
      setCreatedUrl(url);
      setCreatedMeta({
        createdAt: created.createdAt,
        statusLabel: created.statusLabel,
        displayName: created.displayName,
      });
      setComposeOpen(false);
      setResultOpen(true);
      await reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось создать приглашение"
      );
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [inviteLabelDraft, reload]);

  useImperativeHandle(
    ref,
    () => ({
      createInvite: openCompose,
      creating,
    }),
    [openCompose, creating]
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

  async function setHidden(row: EnrollmentRow, hidden: boolean) {
    if (!row.invitationId || busyInvitationId) return;
    setBusyInvitationId(row.invitationId);
    try {
      await apiPlatform("setStudentEnrollmentInvitationHidden", {
        invitationId: row.invitationId,
        hidden,
      });
      setRows((prev) =>
        prev.map((item) =>
          item.studentId === row.studentId ? { ...item, hidden } : item
        )
      );
      toast.success(hidden ? "Приглашение скрыто" : "Приглашение восстановлено");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : hidden
            ? "Не удалось скрыть приглашение"
            : "Не удалось восстановить приглашение"
      );
    } finally {
      setBusyInvitationId(null);
    }
  }

  const visibleRows = rows.filter((r) => !r.hidden);
  const hiddenRows = rows.filter((r) => r.hidden);
  const pending = visibleRows.filter((r) => r.status !== "completed");
  const completed = visibleRows.filter((r) => r.status === "completed");

  function renderRow(row: EnrollmentRow, opts: { hiddenList?: boolean }) {
    const secondaryLabel =
      row.inviteLabel &&
      row.status === "completed" &&
      row.inviteLabel !== row.displayName
        ? `ссылка для: ${row.inviteLabel}`
        : null;

    return (
      <li
        key={row.studentId}
        className={cn(
          "flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
          opts.hiddenList && "py-2.5"
        )}
      >
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">{row.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {row.statusLabel}
            {" · "}
            создано {formatDateTime(row.createdAt)}
            {row.expiresAt ? ` · до ${formatDateTime(row.expiresAt)}` : ""}
            {secondaryLabel ? ` · ${secondaryLabel}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.canCopyLink && row.inviteUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-xl"
              onClick={() => void copyText(absoluteInviteUrl(row.inviteUrl!))}
            >
              Копировать ссылку
            </Button>
          ) : null}
          {row.invitationId ? (
            opts.hiddenList ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={busyInvitationId === row.invitationId}
                onClick={() => void setHidden(row, false)}
              >
                Восстановить
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9 rounded-xl text-muted-foreground"
                disabled={busyInvitationId === row.invitationId}
                onClick={() => void setHidden(row, true)}
              >
                Скрыть
              </Button>
            )
          ) : null}
        </div>
      </li>
    );
  }

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
            onClick={() => void openCompose()}
            data-testid="invite-student-button-inline"
          >
            {creating ? "Создание…" : "Пригласить ученика"}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : pending.length === 0 &&
        completed.length === 0 &&
        hiddenRows.length === 0 ? (
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
                {pending.map((row) => renderRow(row, {}))}
              </ul>
            </div>
          ) : null}

          {completed.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Завершённые
              </p>
              <ul className="divide-y divide-border/70 rounded-xl border border-border/60 bg-muted/20">
                {completed.map((row) => renderRow(row, {}))}
              </ul>
            </div>
          ) : null}

          {hiddenRows.length > 0 ? (
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30"
                onClick={() => setShowHidden((v) => !v)}
                aria-expanded={showHidden}
                data-testid="toggle-hidden-invites"
              >
                <span className="font-medium">
                  Скрытые
                  <span className="ml-2 text-muted-foreground">
                    ({hiddenRows.length})
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {showHidden ? "Свернуть" : "Показать"}
                </span>
              </button>
              {showHidden ? (
                <ul className="divide-y divide-border/70 rounded-xl border border-dashed border-border/70 bg-background/60">
                  {hiddenRows.map((row) =>
                    renderRow(row, { hiddenList: true })
                  )}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Пригласить ученика</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Создайте одноразовую ссылку на 7 дней. Имя нужно только вам — в
              анкету оно не подставится.
            </p>
            <div className="space-y-2">
              <Label htmlFor="enrollment-invite-label">Имя ученика</Label>
              <Input
                id="enrollment-invite-label"
                value={inviteLabelDraft}
                onChange={(e) => setInviteLabelDraft(e.target.value)}
                placeholder="Необязательно"
                maxLength={120}
                autoFocus
                data-testid="enrollment-invite-label-input"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setComposeOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={creating}
              onClick={() => void submitCreate()}
              data-testid="enrollment-invite-create-submit"
            >
              {creating ? "Создание…" : "Создать ссылку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
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
                {createdMeta.displayName}
                {" · "}
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
              onClick={() => setResultOpen(false)}
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
