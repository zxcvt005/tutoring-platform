"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { pressStudentBucketLabel } from "@/lib/press-students";
import { apiPress, apiPressGet } from "@/lib/store/api-client";
import { gradeLabel } from "@/lib/student-contacts";

type Card = {
  student: {
    id: string;
    fullName: string;
    status: "active" | "paused" | "archived";
    bucket: "new" | "active" | "archived";
    grade: string | null;
    telegram: string | null;
    phone: string | null;
    parentContacts: string | null;
    teacherName: string | null;
    createdAt: string;
    tariffName: string | null;
    tariffStatus: string | null;
  };
  currentInfo: string;
  notes: {
    id: string;
    body: string;
    createdAt: string;
    authorName: string | null;
  }[];
};

export function PressStudentCard({ studentId }: { studentId: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [infoState, setInfoState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiPressGet<Card>("student", { id: studentId });
      setCard(data);
      setInfo(data.currentInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить карточку");
    }
  }, [studentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveInfo() {
    setInfoState("saving");
    try {
      await apiPress("saveStudentInfo", {
        studentId,
        currentInfo: info,
      });
      setInfoState("saved");
      toast.success("Актуальная информация сохранена");
    } catch (e) {
      setInfoState("error");
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  }

  async function addNote() {
    if (!noteBody.trim()) return;
    setNoteBusy(true);
    try {
      await apiPress("addInteractionNote", {
        studentId,
        body: noteBody,
      });
      setNoteBody("");
      toast.success("Заметка добавлена");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить заметку");
    } finally {
      setNoteBusy(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/pressa/students" className="text-sm underline">
          К списку
        </Link>
      </div>
    );
  }
  if (!card) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  const s = card.student;

  return (
    <div className="space-y-6">
      <PageHeader
        title={s.fullName}
        description={`${pressStudentBucketLabel[s.bucket]}${
          s.teacherName ? ` · ${s.teacherName}` : " · преподаватель не назначен"
        }`}
        actions={
          <Link
            href="/pressa/students"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            ← К списку
          </Link>
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel space-y-3 p-5">
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Профиль
          </p>
          <Row label="Статус">
            <PersonStatusBadge status={s.status} />
          </Row>
          <Row label="Класс">{gradeLabel(s.grade as never)}</Row>
          <Row label="Преподаватель">{s.teacherName ?? "Не назначен"}</Row>
          <Row label="Тариф">{s.tariffName ?? "Нет тарифа"}</Row>
          <Row label="Телефон">{s.phone || "—"}</Row>
          <Row label="Telegram">{s.telegram || "—"}</Row>
          <Row label="Родители">{s.parentContacts || "—"}</Row>
        </div>

        <div className="panel space-y-3 p-5 lg:col-span-2">
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Актуальная информация
          </p>
          <Textarea
            value={info}
            onChange={(e) => {
              setInfo(e.target.value);
              setInfoState("idle");
            }}
            rows={8}
            placeholder="Текущие важные сведения об ученике для продажника"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void saveInfo()} disabled={infoState === "saving"}>
              {infoState === "saving" ? "Сохранение…" : "Сохранить"}
            </Button>
            {infoState === "saved" ? (
              <span className="text-sm text-success">Сохранено</span>
            ) : null}
            {infoState === "error" ? (
              <span className="text-sm text-destructive">Ошибка сохранения</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel space-y-4 p-5">
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          История взаимодействий
        </p>
        <Textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          rows={3}
          placeholder="Заметка после звонка, сообщения или обсуждения"
        />
        <Button
          type="button"
          disabled={noteBusy || !noteBody.trim()}
          onClick={() => void addNote()}
        >
          {noteBusy ? "Добавление…" : "Добавить запись"}
        </Button>
        {card.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Записей пока нет.</p>
        ) : (
          <ul className="space-y-3">
            {card.notes.map((n) => (
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
