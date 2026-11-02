"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { TrialDialog } from "@/components/pressa/trial-dialog";
import {
  TrialAgreementBadge,
  TrialLessonStatusBadge,
} from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatTime } from "@/lib/format";
import { apiPress, apiPressGet } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { TrialLesson } from "@/lib/trial-lessons";

type Note = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
};

export function PressTrialCard({ trialId }: { trialId: string }) {
  const { data, reload } = useDemoStore();
  const [trial, setTrial] = useState<TrialLesson | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiPressGet<{ trial: TrialLesson; notes: Note[] }>(
        "trial",
        { id: trialId }
      );
      setTrial(res.trial);
      setNotes(res.notes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить пробный");
    }
  }, [trialId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function addNote() {
    if (!noteBody.trim()) return;
    setNoteBusy(true);
    try {
      await apiPress("addTrialNote", { trialId, body: noteBody });
      setNoteBody("");
      toast.success("Запись добавлена");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить запись");
    } finally {
      setNoteBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/pressa/trials" className="text-sm underline">
          К списку
        </Link>
      </div>
    );
  }
  if (!trial) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  const teacherName =
    trial.teacherName ??
    data.teachers.find((t) => t.id === trial.teacherId)?.fullName ??
    trial.teacherId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={trial.prospectName}
        description={`${formatDateTime(trial.startsAt)}–${formatTime(trial.endsAt)} · ${teacherName}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
              Изменить
            </Button>
            <Link
              href="/pressa/trials"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              ← К списку
            </Link>
          </div>
        }
      />

      <section className="panel grid gap-3 p-5 sm:grid-cols-2">
        <Row label="Потенциальный ученик">{trial.prospectName}</Row>
        <Row label="Преподаватель">{teacherName}</Row>
        <Row label="Начало">{formatDateTime(trial.startsAt)}</Row>
        <Row label="Окончание">{formatTime(trial.endsAt)}</Row>
        <Row label="Договорённость">
          <TrialAgreementBadge status={trial.agreementStatus} />
        </Row>
        <Row label="Фактический статус">
          <TrialLessonStatusBadge status={trial.lessonStatus} />
        </Row>
        <div className="sm:col-span-2">
          <p className="text-xs text-muted-foreground">Заметки для преподавателя</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {trial.teacherNotes || "Нет заметок"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-muted-foreground">Внутренние заметки продажника</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {trial.salesNotes || "Нет заметок"}
          </p>
        </div>
      </section>

      <section className="panel flex flex-col gap-4 p-5">
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          История взаимодействий
        </p>
        <Textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          rows={3}
          placeholder="Договорились о времени, перенесли урок, обсудили результат…"
        />
        <Button
          type="button"
          disabled={noteBusy || !noteBody.trim()}
          onClick={() => void addNote()}
        >
          {noteBusy ? "Добавление…" : "Добавить запись"}
        </Button>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Записей пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {n.authorName ?? "Сотрудник"} · {formatDateTime(n.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TrialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trial={trial}
        onSaved={() => {
          void load();
          void reload();
        }}
      />
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
