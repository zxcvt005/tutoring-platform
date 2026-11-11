"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EnterCabinetButton } from "@/components/admin/enter-cabinet-button";
import { ProfileAccessPanel } from "@/components/admin/profile-access-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
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
import {
  currentAssignmentForStudent,
  packageStatusLabel,
  studentTariffLabel,
} from "@/lib/tariff-package";
import { averageFinishedAttempt2 } from "@/lib/tests/attempts";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import { STUDENT_GRADES, gradeLabel } from "@/lib/student-contacts";
import type {
  PersonStatus,
  Student,
  StudentArchiveReason,
  StudentGrade,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type FormState = {
  id?: string;
  fullName: string;
  grade: StudentGrade | "";
  telegram: string;
  phone: string;
  status: PersonStatus;
  teacherId: string;
  tariffId: string;
  parentContacts: string;
  notes: string;
};

const emptyForm = (teacherId: string): FormState => ({
  fullName: "",
  grade: "",
  telegram: "",
  phone: "",
  status: "active",
  teacherId,
  tariffId: "",
  parentContacts: "",
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
  const [initialTariffId, setInitialTariffId] = useState("");
  const [assignFor, setAssignFor] = useState<Student | null>(null);
  const [assignTariffId, setAssignTariffId] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [listSection, setListSection] = useState<"work" | "archive">("work");
  const [archiveFor, setArchiveFor] = useState<Student | null>(null);
  const [archiveReason, setArchiveReason] =
    useState<StudentArchiveReason>("stopped");
  const [archiveComment, setArchiveComment] = useState("");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null);

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
    setInitialTariffId("");
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
    const currentTariff = data.tariffAssignments
      .filter((a) => a.studentId === student.id)
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      )[0];
    const tariffId = student.purchaseTariffId ?? currentTariff?.tariffId ?? "";
    setInitialTariffId(tariffId);
    setForm({
      id: student.id,
      fullName: student.fullName,
      grade: student.grade ?? "",
      telegram: student.telegram ?? "",
      phone: student.phone ?? "",
      status: student.status,
      teacherId: student.teacherId,
      tariffId,
      parentContacts: student.parentContacts ?? "",
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
      parentContacts: form.parentContacts.trim() || null,
      notes: form.notes.trim() || undefined,
    });
    if (!saved.ok) return;
    if (
      mode === "direkciya" &&
      form.tariffId &&
      form.tariffId !== initialTariffId
    ) {
      try {
        await apiPlatform("setStudentPurchaseTariff", {
          studentId: id,
          tariffId: form.tariffId,
          reason: !form.id
            ? "Назначение при создании ученика"
            : "Тариф для будущей оплаты",
        });
        toast.success(
          "Тариф назначен. Оплата создаётся, когда ученик перейдёт к оплате в Аудитории."
        );
        await reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось назначить тариф");
      }
    }
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

  async function saveAssign() {
    if (!assignFor || !assignTariffId) return;
    setAssignBusy(true);
    try {
      await apiPlatform("setStudentPurchaseTariff", {
        studentId: assignFor.id,
        tariffId: assignTariffId,
        reason: assignReason.trim() || undefined,
      });
      toast.success(
        "Тариф назначен. Оплата создаётся, когда ученик перейдёт к оплате в Аудитории."
      );
      setAssignFor(null);
      setAssignReason("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось назначить тариф");
    } finally {
      setAssignBusy(false);
    }
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
            <Button type="button" className="rounded-full" onClick={openCreate}>
              Добавить ученика
            </Button>
          ) : null
        }
      />

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
                  <TableHead>Тариф</TableHead>
                  <TableHead>Остаток</TableHead>
                  <TableHead>Использовано</TableHead>
                  <TableHead>Прогноз</TableHead>
                  <TableHead>Оплата</TableHead>
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
                    const asg = currentAssignmentForStudent(
                      data.tariffAssignments,
                      s.id
                    );
                    return (
                      <TariffBalanceNotice
                        remaining={asg?.lessonsRemaining}
                        packageStatus={asg?.packageStatus}
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
                      const asg = currentAssignmentForStudent(
                        data.tariffAssignments,
                        s.id
                      );
                      return (
                        <>
                          <TableCell className="tabular-nums whitespace-nowrap">
                            {avg2 == null ? "—" : `${avg2}%`}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            —
                          </TableCell>
                          <TableCell className="min-w-[8.5rem]">
                            {(() => {
                              const labeled = studentTariffLabel({
                                assignments: data.tariffAssignments,
                                studentId: s.id,
                                tariffs: data.tariffs,
                                purchaseTariffId: s.purchaseTariffId,
                              });
                              if (!labeled) {
                                return (
                                  <span className="text-muted-foreground">—</span>
                                );
                              }
                              return (
                                <div>
                                  <div className="font-medium leading-tight">
                                    {labeled.name}
                                  </div>
                                  <div className="text-[0.7rem] text-muted-foreground">
                                    {asg
                                      ? packageStatusLabel[asg.packageStatus ?? "none"]
                                      : packageStatusLabel.unpaid}
                                  </div>
                                </div>
                              );
                            })()}
                          </TableCell>
                        </>
                      );
                    })()
                  : null}
                <TableCell>
                  <PersonStatusBadge status={s.status} />
                </TableCell>
                {mode === "direkciya"
                  ? (() => {
                      const asg = currentAssignmentForStudent(
                        data.tariffAssignments,
                        s.id
                      );
                      const labeled = studentTariffLabel({
                        assignments: data.tariffAssignments,
                        studentId: s.id,
                        tariffs: data.tariffs,
                        purchaseTariffId: s.purchaseTariffId,
                      });
                      const pkg = asg?.packageStatus ?? "none";
                      return (
                        <>
                          <TableCell>
                            {labeled ? (
                              labeled.name
                            ) : (
                              <span className="text-muted-foreground">Нет тарифа</span>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {asg?.lessonsRemaining == null
                              ? "—"
                              : asg.lessonsRemaining}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {asg?.lessonsUsed ?? "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {asg ? formatDate(asg.endsAt) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {asg
                              ? packageStatusLabel[pkg]
                              : labeled
                                ? packageStatusLabel.unpaid
                                : packageStatusLabel.none}
                          </TableCell>
                        </>
                      );
                    })()
                  : null}
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
                          className="text-sm font-medium underline-offset-2 hover:underline"
                          onClick={() => {
                            const current = currentAssignmentForStudent(
                              data.tariffAssignments,
                              s.id
                            );
                            setAssignTariffId(
                              s.purchaseTariffId ?? current?.tariffId ?? ""
                            );
                            setAssignReason("");
                            setAssignFor(s);
                          }}
                        >
                          Тариф
                        </button>
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
                      </>
                    ) : null}
                    {archivedView ? (
                      <button
                        type="button"
                        className="text-sm font-medium underline-offset-2 hover:underline"
                        disabled={restoreBusyId === s.id}
                        onClick={() => void confirmRestore(s)}
                      >
                        Вернуть в работу
                      </button>
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
            {mode === "direkciya" ? (
              <div className="space-y-1.5">
                <Label>Тариф</Label>
                <Select
                  value={form.tariffId || "__none__"}
                  onValueChange={(v) =>
                    v &&
                    setForm({
                      ...form,
                      tariffId: v === "__none__" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        !v || v === "__none__"
                          ? "Не назначен"
                          : (data.tariffs.find((t) => t.id === v)?.name ?? "—")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Не назначен</SelectItem>
                    {data.tariffs
                      .filter((t) => t.status === "active")
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} · {t.price.toLocaleString("ru-RU")} ₽
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  При сохранении меняется только тариф для будущей оплаты.
                  История назначений и списаний не пересчитывается.
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Контакты родителей</Label>
              <Textarea
                value={form.parentContacts}
                onChange={(e) =>
                  setForm({ ...form, parentContacts: e.target.value })
                }
                placeholder="Имя, телефон, Telegram…"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Заметки</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Внутренние заметки администрации"
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
        open={!!assignFor}
        onOpenChange={(o) => {
          if (!o) setAssignFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Тариф{assignFor ? ` · ${assignFor.fullName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Назначить тариф</Label>
            <Select
              value={assignTariffId || "__none__"}
              onValueChange={(v) =>
                v && setAssignTariffId(v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) =>
                    !v || v === "__none__"
                      ? "Не выбран"
                      : (data.tariffs.find((t) => t.id === v)?.name ?? "—")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Не выбран</SelectItem>
                {data.tariffs
                  .filter((t) => t.status === "active")
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.lessonsLimit ?? "—"} зан. ·{" "}
                      {t.price.toLocaleString("ru-RU")} ₽
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Тариф назначается сразу. Заявка на оплату не создаётся — ученик
              оплачивает его в Аудитории. Действующий пакет не меняется, пока
              оплата не подтверждена.
            </p>
            <Label>Причина (необязательно)</Label>
            <Textarea
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder="Согласовано с куратором…"
              rows={2}
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignFor(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!assignTariffId || assignBusy}
              onClick={() => void saveAssign()}
            >
              Назначить тариф
            </Button>
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
    </div>
  );
}
