"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { StudentAvailabilityPanel } from "@/components/students/student-availability-panel";
import { StudentQuestionnaireSections } from "@/components/students/student-questionnaire-sections";
import { StudentProfileEditDialog } from "@/components/students/student-profile-edit-dialog";
import {
  HomeworkAssignmentStatusBadge,
  LessonStatusBadge,
  PersonStatusBadge,
} from "@/components/status-badge";
import { TariffBalanceNotice } from "@/components/tariff-balance-notice";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatDueAt } from "@/lib/format";
import { pressStudentBucketLabel } from "@/lib/press-students";
import { apiPress, apiPressGet } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import { getAssignmentTitle } from "@/lib/tests/helpers";

type SalesCard = {
  currentInfo: string;
  notes: {
    id: string;
    body: string;
    createdAt: string;
    authorName: string | null;
  }[];
};

function packageStatusFromBalance(
  balance: number | null
): "active" | "exhausted" | "debt" | "none" {
  if (balance == null) return "none";
  if (balance <= -1) return "debt";
  if (balance <= 0) return "exhausted";
  return "active";
}

export function PressStudentCard({ studentId }: { studentId: string }) {
  const { data, upsertStudent, assignmentsForStudent, ready, reload } =
    useDemoStore();
  const [editOpen, setEditOpen] = useState(false);
  const [sales, setSales] = useState<SalesCard | null>(null);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [infoState, setInfoState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const student = data.students.find((s) => s.id === studentId);
  const teacher = student
    ? data.teachers.find((t) => t.id === student.teacherId) ??
      data.teachers.find((t) => t.id === (student.previousTeacherId ?? ""))
    : undefined;
  const directionBalances = student?.directionBalances ?? [];
  const minBalance = directionBalances.length
    ? Math.min(...directionBalances.map((b) => b.balance))
    : null;

  const lessons = useMemo(
    () =>
      data.lessons
        .filter((l) => l.studentIds.includes(studentId))
        .sort(
          (a, b) =>
            new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
        ),
    [data.lessons, studentId]
  );
  const assignments = assignmentsForStudent(studentId);

  const loadSales = useCallback(async () => {
    setSalesError(null);
    try {
      const card = await apiPressGet<SalesCard & { student: unknown }>(
        "student",
        { id: studentId }
      );
      setSales({ currentInfo: card.currentInfo, notes: card.notes });
      setInfo(card.currentInfo);
    } catch (e) {
      setSalesError(
        e instanceof Error ? e.message : "Не удалось загрузить продажи"
      );
    }
  }, [studentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSales(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSales]);

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
      await loadSales();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Не удалось добавить заметку"
      );
    } finally {
      setNoteBusy(false);
    }
  }

  if (ready && !student) {
    notFound();
  }
  if (!student) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  const bucket =
    student.status === "archived"
      ? "archived"
      : !student.teacherId
        ? "new"
        : "active";

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.fullName}
        description={`${pressStudentBucketLabel[bucket]}${
          teacher
            ? ` · ${teacher.fullName}`
            : " · преподаватель не назначен"
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {student.status !== "archived" ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setEditOpen(true)}
              >
                Редактировать
              </Button>
            ) : null}
            <Link
              href="/pressa/students"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              ← К списку
            </Link>
          </div>
        }
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#5B4A63]">
            Анкета регистрации
          </h2>
          <PersonStatusBadge status={student.status} />
        </div>
        <StudentQuestionnaireSections
          student={student}
          teacherName={teacher?.fullName}
        />
        <StudentAvailabilityPanel studentId={student.id} canEdit />
      </div>

      <section className="panel space-y-3 p-5">
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Баланс по направлениям
        </p>
        {directionBalances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Баланс по направлениям появится после покупки занятий.
          </p>
        ) : (
          <div className="space-y-1.5 text-sm">
            {directionBalances.map((b) => (
              <div
                key={b.directionId}
                className="flex justify-between gap-2 tabular-nums"
              >
                <span>{b.directionName ?? b.directionSlug ?? "—"}</span>
                <span className="font-medium">{b.balance}</span>
              </div>
            ))}
          </div>
        )}
        <TariffBalanceNotice
          remaining={minBalance}
          packageStatus={packageStatusFromBalance(minBalance)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel space-y-3 p-5 lg:col-span-3">
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Актуальная информация
          </p>
          {salesError ? (
            <p className="text-sm text-destructive">{salesError}</p>
          ) : null}
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
            <Button
              type="button"
              onClick={() => void saveInfo()}
              disabled={infoState === "saving"}
            >
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
        {!sales ? (
          <p className="text-sm text-muted-foreground">Загрузка заметок…</p>
        ) : sales.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Записей пока нет.</p>
        ) : (
          <ul className="space-y-3">
            {sales.notes.map((n) => (
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

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Домашние задания
        </h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет назначений.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Задание</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Балл</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => {
                const hw = data.homeworks.find((h) => h.id === a.homeworkId);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {getAssignmentTitle(a, hw)}
                    </TableCell>
                    <TableCell>{formatDueAt(a.dueAt)}</TableCell>
                    <TableCell>
                      <HomeworkAssignmentStatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {a.score != null
                        ? `${a.score}/${a.maxScore ?? "—"}`
                        : a.status === "completed"
                          ? "ждёт проверки"
                          : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          История занятий
        </h2>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Занятий пока нет.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Когда</TableHead>
                <TableHead>Предмет</TableHead>
                <TableHead>Тема</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessons.map((l) => {
                const topic = data.topics.find((t) => t.id === l.topicId);
                return (
                  <TableRow key={l.id}>
                    <TableCell>{formatDateTime(l.startsAt)}</TableCell>
                    <TableCell>{l.subject || "—"}</TableCell>
                    <TableCell>{topic?.title ?? "—"}</TableCell>
                    <TableCell>
                      <LessonStatusBadge status={l.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <StudentProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        student={student}
        teachers={data.teachers}
        onSave={async (values) => {
          const saved = await upsertStudent({
            id: values.id,
            fullName: values.fullName,
            grade: values.grade || null,
            telegram: values.telegram || null,
            phone: values.phone || null,
            status: values.status,
            teacherId: values.teacherId,
            parentName: values.parentName || null,
            parentContacts: values.parentContacts || null,
            learningGoal: values.learningGoal || null,
            notes: values.notes || undefined,
          });
          if (saved.ok) {
            await reload();
            return true;
          }
          return false;
        }}
      />
    </div>
  );
}
