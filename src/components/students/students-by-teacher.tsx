"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { EnterCabinetButton } from "@/components/admin/enter-cabinet-button";
import { ProfileAccessPanel } from "@/components/admin/profile-access-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
import {
  StudentEnrollmentInvites,
  type StudentEnrollmentInvitesHandle,
} from "@/components/students/student-enrollment-invites";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { TariffBalanceNotice } from "@/components/tariff-balance-notice";
import { nextTeacherFilterAfterStudentSave } from "@/lib/students/teacher-filter-after-save";
import {
  formatDate,
  personStatusLabel,
  studentArchiveReasonLabel,
} from "@/lib/format";
import { averageFinishedAttempt2 } from "@/lib/tests/attempts";
import { useDemoStore } from "@/lib/store/demo-store";
import { STUDENT_GRADES, gradeLabel } from "@/lib/student-contacts";
import type {
  PersonStatus,
  Student,
  StudentArchiveReason,
  StudentGrade,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function minDirectionBalance(student: Student): number | null {
  const balances = student.directionBalances ?? [];
  if (!balances.length) return null;
  return Math.min(...balances.map((b) => b.balance));
}

function directionBalancesLabel(student: Student): string {
  const balances = student.directionBalances ?? [];
  if (!balances.length) return "—";
  return balances
    .map((b) => `${b.directionName ?? b.directionSlug ?? "…"}: ${b.balance}`)
    .join(" · ");
}

function packageStatusFromBalance(
  balance: number | null
): "active" | "exhausted" | "debt" | "none" {
  if (balance == null) return "none";
  if (balance <= -1) return "debt";
  if (balance <= 0) return "exhausted";
  return "active";
}

type FormState = {
  id?: string;
  fullName: string;
  grade: StudentGrade | "";
  telegram: string;
  phone: string;
  status: PersonStatus;
  teacherId: string;
  parentName: string;
  parentContacts: string;
  learningGoal: string;
  notes: string;
};

const emptyForm = (teacherId: string): FormState => ({
  fullName: "",
  grade: "",
  telegram: "",
  phone: "",
  status: "active",
  teacherId,
  parentName: "",
  parentContacts: "",
  learningGoal: "",
  notes: "",
});

export function StudentsByTeacher({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const {
    data,
    upsertStudent,
    archiveStudent,
    restoreStudent,
    deleteStudent,
    studentsForTeacher,
    unassignedStudents,
    reload,
  } = useDemoStore();

  const [teacherFilter, setTeacherFilter] = useState<string>(
    mode === "kafedra" ? data.currentTeacherId : "unassigned"
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PersonStatus>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(data.teachers[0]?.id ?? ""));
  const [listSection, setListSection] = useState<"work" | "archive">("work");
  const [archiveFor, setArchiveFor] = useState<Student | null>(null);
  const [archiveReason, setArchiveReason] =
    useState<StudentArchiveReason>("stopped");
  const [archiveComment, setArchiveComment] = useState("");
  const [deleteFor, setDeleteFor] = useState<Student | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null);
  const enrollmentRef = useRef<StudentEnrollmentInvitesHandle>(null);
  const [inviteCreating, setInviteCreating] = useState(false);

  const basePath = mode === "direkciya" ? "/direkciya" : "/kafedra";

  const rows = useMemo(() => {
    const archived = mode === "direkciya" && listSection === "archive";
    let list: Student[];
    if (mode === "kafedra") {
      list = studentsForTeacher(data.currentTeacherId);
    } else if (archived) {
      const allArchived = data.students.filter((s) => s.status === "archived");
      list =
        teacherFilter === "all"
          ? allArchived
          : teacherFilter === "unassigned"
            ? allArchived.filter((s) => !s.previousTeacherId)
            : allArchived.filter((s) => s.previousTeacherId === teacherFilter);
    } else if (teacherFilter === "all") {
      list = data.students.filter((s) => s.status !== "archived");
    } else if (teacherFilter === "unassigned") {
      list = unassignedStudents();
    } else {
      list = studentsForTeacher(teacherFilter);
    }

    return list
      .filter((s) => {
        if (!archived && statusFilter !== "all" && s.status !== statusFilter) {
          return false;
        }
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          s.fullName.toLowerCase().includes(q) ||
          (s.telegram?.toLowerCase().includes(q) ?? false) ||
          (s.phone?.toLowerCase().includes(q) ?? false) ||
          (s.contacts?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  }, [
    data.currentTeacherId,
    data.students,
    listSection,
    mode,
    query,
    statusFilter,
    studentsForTeacher,
    teacherFilter,
    unassignedStudents,
  ]);

  const editable = mode === "direkciya" || mode === "kafedra";

  function openCreate() {
    setForm(
      emptyForm(
        mode === "kafedra"
          ? data.currentTeacherId
          : teacherFilter !== "all" && teacherFilter !== "unassigned"
            ? teacherFilter
            : (data.teachers[0]?.id ?? "")
      )
    );
    setOpen(true);
  }

  function openEdit(student: Student) {
    setForm({
      id: student.id,
      fullName: student.fullName,
      grade: student.grade ?? "",
      telegram: student.telegram ?? "",
      phone: student.phone ?? "",
      status: student.status,
      teacherId: student.teacherId,
      parentName: student.parentName ?? "",
      parentContacts: student.parentContacts ?? "",
      learningGoal: student.learningGoal ?? "",
      notes: student.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.fullName.trim()) return;
    const id =
      form.id ?? `s_${Math.random().toString(36).slice(2, 9)}`;
    const teacherId = form.teacherId;
    const saved = await upsertStudent({
      id,
      fullName: form.fullName.trim(),
      grade: form.grade || null,
      telegram: form.telegram.trim() || null,
      phone: form.phone.trim() || null,
      status: form.status,
      teacherId,
      parentName: form.parentName.trim() || null,
      parentContacts: form.parentContacts.trim() || null,
      learningGoal: form.learningGoal.trim() || null,
      notes: form.notes.trim() || undefined,
    });
    if (!saved.ok) return;
    // Default list filter is «Без преподавателя»; after create with a teacher
    // switch the filter so the new student is visible in the table.
    const nextFilter = nextTeacherFilterAfterStudentSave({
      mode,
      listSection,
      savedTeacherId: teacherId,
      currentFilter: teacherFilter,
    });
    if (nextFilter) setTeacherFilter(nextFilter);
    if (!form.id) {
      toast.success("Ученик сохранён");
    }
    setOpen(false);
  }

  const teacherName = (id: string) =>
    !id ? "Не назначен" : (data.teachers.find((t) => t.id === id)?.fullName ?? "—");

  const lastLessonAt = (studentId: string) => {
    const done = data.lessons
      .filter(
        (l) => l.studentIds.includes(studentId) && l.status !== "cancelled"
      )
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      );
    return done[0]?.startsAt ?? null;
  };

  async function confirmArchive() {
    if (!archiveFor) return;
    setArchiveBusy(true);
    try {
      const result = await archiveStudent({
        id: archiveFor.id,
        reason: archiveReason,
        comment: archiveReason === "other" ? archiveComment.trim() || null : null,
      });
      if (!result.ok) {
        toast.error(result.error || "Не удалось архивировать");
        return;
      }
      toast.success("Ученик переведён в архив");
      setArchiveFor(null);
      setOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось архивировать");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function confirmRestore(student: Student) {
    setRestoreBusyId(student.id);
    try {
      const result = await restoreStudent(student.id);
      if (!result.ok) {
        toast.error(result.error || "Не удалось вернуть в работу");
        return;
      }
      toast.success("Ученик возвращён в работу");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось вернуть");
    } finally {
      setRestoreBusyId(null);
    }
  }

  function openPermanentDelete(student: Student) {
    setDeleteConfirmName("");
    setDeleteFor(student);
  }

  async function confirmPermanentDelete() {
    if (!deleteFor) return;
    setDeleteBusy(true);
    try {
      const result = await deleteStudent({
        id: deleteFor.id,
        confirmFullName: deleteConfirmName.trim(),
      });
      if (!result.ok) {
        toast.error(result.error || "Не удалось удалить ученика");
        return;
      }
      toast.success("Ученик удалён безвозвратно");
      setDeleteFor(null);
      setDeleteConfirmName("");
      setOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setDeleteBusy(false);
    }
  }

  const archivedView = mode === "direkciya" && listSection === "archive";
  const archivedCount = data.students.filter((s) => s.status === "archived").length;

  return (
    <div>
      <PageHeader
        title="Ученики"
        description={
          mode === "kafedra"
            ? "Ваши ученики. История сохраняется при любых изменениях."
            : "Ученики по преподавателям. Смена преподавателя не удаляет историю."
        }
        actions={
          editable && !archivedView ? (
            <div className="flex flex-wrap gap-2">
              {mode === "direkciya" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={inviteCreating}
                  data-testid="invite-student-button"
                  onClick={() => {
                    setInviteCreating(true);
                    void enrollmentRef.current
                      ?.createInvite()
                      .finally(() => setInviteCreating(false));
                  }}
                >
                  {inviteCreating ? "Создание…" : "Пригласить ученика"}
                </Button>
              ) : null}
              <Button type="button" className="rounded-full" onClick={openCreate}>
                Добавить ученика
              </Button>
            </div>
          ) : null
        }
      />

      {mode === "direkciya" && !archivedView ? (
        <StudentEnrollmentInvites ref={enrollmentRef} className="mb-6" />
      ) : null}

      {mode === "direkciya" ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setListSection("work")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              listSection === "work"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/80 hover:bg-muted/50"
            )}
          >
            Ученики в работе
          </button>
          <button
            type="button"
            onClick={() => setListSection("archive")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              listSection === "archive"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/80 hover:bg-muted/50"
            )}
          >
            Ученики в архиве{" "}
            <span className="tabular-nums opacity-70">({archivedCount})</span>
          </button>
        </div>
      ) : null}

      <FilterBar>
        {mode === "direkciya" ? (
          <Select
            value={teacherFilter}
            onValueChange={(v) => v && setTeacherFilter(v)}
          >
            <SelectTrigger className="w-full border-transparent bg-background sm:w-56">
              <SelectValue>
                {(v) =>
                  v === "all"
                    ? "Все преподаватели"
                    : v === "unassigned"
                      ? "Без преподавателя"
                      : (data.teachers.find((t) => t.id === v)?.fullName ?? "—")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все преподаватели</SelectItem>
              <SelectItem value="unassigned">Без преподавателя</SelectItem>
              {data.teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          className="border-transparent bg-background sm:max-w-xs"
        />
        {archivedView ? null : (
        <Select
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v as "all" | PersonStatus)}
        >
          <SelectTrigger className="w-full border-transparent bg-background sm:w-40">
            <SelectValue>
              {(v) =>
                v === "active" || v === "paused"
                  ? personStatusLabel[v as PersonStatus]
                  : "Все статусы"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">{personStatusLabel.active}</SelectItem>
            <SelectItem value="paused">{personStatusLabel.paused}</SelectItem>
          </SelectContent>
        </Select>
        )}
      </FilterBar>

      {mode === "direkciya" && teacherFilter === "all" ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.teachers.map((t) => {
            const count = studentsForTeacher(t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTeacherFilter(t.id)}
                className={cn(
                  "rounded-full border border-border/80 px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                  teacherFilter === t.id && "bg-primary text-primary-foreground"
                )}
              >
                {t.fullName}{" "}
                <span className="tabular-nums opacity-70">({count})</span>
              </button>
            );
          })}
          {unassignedStudents().length > 0 ? (
            <button
              type="button"
              onClick={() => setTeacherFilter("unassigned")}
              className="rounded-full border border-destructive/30 px-3 py-1.5 text-sm text-destructive"
            >
              Без преподавателя ({unassignedStudents().length})
            </button>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={
            query.trim()
              ? "Никого не нашли"
              : mode === "direkciya" && teacherFilter === "unassigned"
              ? "Все ученики назначены"
              : "Нет учеников"
          }
          description={
            query.trim()
              ? "Измените поисковый запрос или фильтр преподавателя."
              : mode === "direkciya" && teacherFilter === "unassigned"
              ? "Сейчас нет учеников без преподавателя. Можно показать всех или выбрать преподавателя."
              : "Измените фильтр или добавьте запись."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ФИО</TableHead>
              {mode === "direkciya" ? (
                <TableHead>
                  {archivedView ? "Бывший преподаватель" : "Преподаватель"}
                </TableHead>
              ) : null}
              {archivedView ? (
                <>
                  <TableHead>Дата архивации</TableHead>
                  <TableHead>Причина</TableHead>
                  <TableHead>Последнее занятие</TableHead>
                </>
              ) : null}
              {mode === "kafedra" ? (
                <>
                  <TableHead className="whitespace-nowrap">
                    Ср. ДЗ, 2-я попытка
                  </TableHead>
                  <TableHead>Класс</TableHead>
                  <TableHead>Тариф</TableHead>
                </>
              ) : null}
              <TableHead>Статус</TableHead>
              {mode === "direkciya" ? (
                <>
                  <TableHead>Баланс занятий</TableHead>
                  <TableHead>Аккаунт</TableHead>
                </>
              ) : null}
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link
                    href={`${basePath}/students/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {s.fullName}
                  </Link>
                  {s.contacts ? (
                    <div className="text-xs text-muted-foreground">{s.contacts}</div>
                  ) : null}
                  {(() => {
                    const remaining = minDirectionBalance(s);
                    return (
                      <TariffBalanceNotice
                        remaining={remaining}
                        packageStatus={packageStatusFromBalance(remaining)}
                        compact
                        className="mt-1"
                      />
                    );
                  })()}
                </TableCell>
                {mode === "direkciya" ? (
                  <TableCell
                    className={cn(
                      !(archivedView ? s.previousTeacherId : s.teacherId) &&
                        "text-destructive"
                    )}
                  >
                    {teacherName(
                      archivedView ? (s.previousTeacherId ?? "") : s.teacherId
                    )}
                  </TableCell>
                ) : null}
                {archivedView ? (
                  <>
                    <TableCell className="text-sm tabular-nums">
                      {s.archivedAt ? formatDate(s.archivedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.archivedReason
                        ? studentArchiveReasonLabel[s.archivedReason]
                        : "—"}
                      {s.archivedReason === "other" && s.archivedComment ? (
                        <div className="text-xs text-muted-foreground">
                          {s.archivedComment}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {lastLessonAt(s.id)
                        ? formatDate(lastLessonAt(s.id)!)
                        : "—"}
                    </TableCell>
                  </>
                ) : null}
                {mode === "kafedra"
                  ? (() => {
                      const avg2 = averageFinishedAttempt2(
                        data.homeworkAssignments.filter(
                          (a) =>
                            a.studentId === s.id &&
                            a.sourceKind !== "theory" &&
                            a.sourceKind !== "intensive"
                        )
                      );
                      return (
                        <>
                          <TableCell className="tabular-nums whitespace-nowrap">
                            {avg2 == null ? "—" : `${avg2}%`}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            —
                          </TableCell>
                          <TableCell className="min-w-[8.5rem] text-sm">
                            {directionBalancesLabel(s)}
                          </TableCell>
                        </>
                      );
                    })()
                  : null}
                <TableCell>
                  <PersonStatusBadge status={s.status} />
                </TableCell>
                {mode === "direkciya" ? (
                  <TableCell className="max-w-[14rem] text-sm">
                    {directionBalancesLabel(s)}
                  </TableCell>
                ) : null}
                {mode === "direkciya" ? (
                  <TableCell className="text-xs text-muted-foreground">
                    {s.accountEmail ? (
                      <>
                        <div>{s.accountEmail}</div>
                        <div>роль: student</div>
                      </>
                    ) : (
                      "нет входа"
                    )}
                  </TableCell>
                ) : null}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {mode === "direkciya" ? (
                      <EnterCabinetButton
                        userId={s.userId}
                        studentId={s.id}
                      />
                    ) : null}
                    <Link
                      href={`${basePath}/students/${s.id}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      Карточка
                    </Link>
                    {mode === "direkciya" && !archivedView ? (
                      <>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => openEdit(s)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="text-sm text-destructive underline-offset-2 hover:underline"
                          onClick={() => {
                            setArchiveReason("stopped");
                            setArchiveComment("");
                            setArchiveFor(s);
                          }}
                        >
                          В архив
                        </button>
                        <button
                          type="button"
                          className="text-sm text-destructive underline-offset-2 hover:underline"
                          onClick={() => openPermanentDelete(s)}
                        >
                          Удалить навсегда
                        </button>
                      </>
                    ) : null}
                    {archivedView ? (
                      <>
                        <button
                          type="button"
                          className="text-sm font-medium underline-offset-2 hover:underline"
                          disabled={restoreBusyId === s.id}
                          onClick={() => void confirmRestore(s)}
                        >
                          Вернуть в работу
                        </button>
                        <button
                          type="button"
                          className="text-sm text-destructive underline-offset-2 hover:underline"
                          onClick={() => openPermanentDelete(s)}
                        >
                          Удалить навсегда
                        </button>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
            <DialogTitle>
              {form.id ? "Редактировать ученика" : "Новый ученик"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>ФИО</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Класс</Label>
              <Select
                value={form.grade || "__none__"}
                onValueChange={(v) =>
                  v &&
                  setForm({
                    ...form,
                    grade: v === "__none__" ? "" : (v as StudentGrade),
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === "__none__"
                        ? gradeLabel(null)
                        : gradeLabel(String(v))
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{gradeLabel(null)}</SelectItem>
                  {STUDENT_GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {gradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Telegram</Label>
                <Input
                  value={form.telegram}
                  onChange={(e) =>
                    setForm({ ...form, telegram: e.target.value })
                  }
                  placeholder="@username"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Телефон</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+7 …"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Преподаватель</Label>
              <Select
                value={form.teacherId || "__none__"}
                onValueChange={(v) =>
                  v && setForm({ ...form, teacherId: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === "__none__"
                        ? "Не назначен"
                        : (data.teachers.find((t) => t.id === v)?.fullName ?? "—")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не назначен</SelectItem>
                  {data.teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  v && setForm({ ...form, status: v as PersonStatus })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      personStatusLabel[v as PersonStatus] ?? "Статус"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {personStatusLabel.active}
                  </SelectItem>
                  <SelectItem value="paused">
                    {personStatusLabel.paused}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ФИО родителя</Label>
              <Input
                value={form.parentName}
                onChange={(e) =>
                  setForm({ ...form, parentName: e.target.value })
                }
                placeholder="Как в анкете регистрации"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Контакт родителя (Telegram или телефон)</Label>
              <Textarea
                value={form.parentContacts}
                onChange={(e) =>
                  setForm({ ...form, parentContacts: e.target.value })
                }
                placeholder="Telegram или телефон"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Цель подготовки</Label>
              <Textarea
                value={form.learningGoal}
                onChange={(e) =>
                  setForm({ ...form, learningGoal: e.target.value })
                }
                placeholder="Из анкеты ученика"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Дополнительная информация</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Из анкеты / внутренние заметки"
              />
            </div>
          </div>
          {form.id && mode === "direkciya" ? (
            <div className="mt-4" data-testid="student-edit-access-panel">
              <ProfileAccessPanel
                studentId={form.id}
                accountEmail={
                  data.students.find((s) => s.id === form.id)?.accountEmail
                }
                hasAccount={Boolean(
                  data.students.find((s) => s.id === form.id)?.userId
                )}
              />
            </div>
          ) : null}
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 rounded-none sm:justify-between">
            {form.id && mode === "direkciya" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    const student = data.students.find((x) => x.id === form.id);
                    if (!student) return;
                    setArchiveReason("stopped");
                    setArchiveComment("");
                    setArchiveFor(student);
                  }}
                >
                  В архив
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    const student = data.students.find((x) => x.id === form.id);
                    if (!student) return;
                    openPermanentDelete(student);
                  }}
                >
                  Удалить навсегда
                </Button>
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void save()}>
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!archiveFor}
        onOpenChange={(o) => {
          if (!o) setArchiveFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              В архив{archiveFor ? ` · ${archiveFor.fullName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ученик будет переведён в архив и отвязан от преподавателя. История
            занятий, платежей, тарифов и результатов сохранится.
          </p>
          <div className="space-y-1.5">
            <Label>Причина</Label>
            <Select
              value={archiveReason}
              onValueChange={(v) =>
                v && setArchiveReason(v as StudentArchiveReason)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) =>
                    studentArchiveReasonLabel[v as StudentArchiveReason] ??
                    "Причина"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial_not_continued">
                  {studentArchiveReasonLabel.trial_not_continued}
                </SelectItem>
                <SelectItem value="stopped">
                  {studentArchiveReasonLabel.stopped}
                </SelectItem>
                <SelectItem value="other">
                  {studentArchiveReasonLabel.other}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {archiveReason === "other" ? (
            <div className="space-y-1.5">
              <Label>Комментарий (необязательно)</Label>
              <Textarea
                value={archiveComment}
                onChange={(e) => setArchiveComment(e.target.value)}
                rows={3}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveFor(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={archiveBusy}
              onClick={() => void confirmArchive()}
            >
              Перевести в архив
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteFor}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteFor(null);
            setDeleteConfirmName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Удалить навсегда
              {deleteFor ? ` · ${deleteFor.fullName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium text-destructive">
              Действие необратимо. Восстановить ученика будет нельзя.
            </p>
            <p className="text-muted-foreground">
              Будут безвозвратно удалены:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>аккаунт и профиль ученика;</li>
              <li>неуспешные попытки оплаты и незавершённые заказы;</li>
              <li>абонементы, баланс и история движения занятий;</li>
              <li>приглашения и согласия, связанные с учеником;</li>
              <li>посещаемость и участие в занятиях (сами групповые занятия и другие ученики сохранятся);</li>
              <li>прочие учебные данные, принадлежащие только этому ученику.</li>
            </ul>
            <p className="text-muted-foreground">
              Успешные платежи, подтверждённые возвраты и PDF-документы расчётов
              сохраняются в финансовом разделе дирекции (без связи с удалённым
              аккаунтом). Не затрагиваются: директора, преподаватели, другие
              ученики, направления, тарифы, материалы и настройки школы.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="delete-student-confirm-name">
                Введите полное имя ученика для подтверждения
              </Label>
              <Input
                id="delete-student-confirm-name"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={deleteFor?.fullName ?? "ФИО"}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteFor(null);
                setDeleteConfirmName("");
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                deleteBusy ||
                !deleteFor ||
                deleteConfirmName.trim() !== (deleteFor?.fullName.trim() ?? "")
              }
              onClick={() => void confirmPermanentDelete()}
            >
              Удалить безвозвратно
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
