"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EnterCabinetButton } from "@/components/admin/enter-cabinet-button";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherStatusBadge } from "@/components/status-badge";
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

import { initialsFromName, teacherStatusLabel } from "@/lib/format";
import { ensureCsrfToken } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Teacher, TeacherStatus } from "@/lib/types";

type FormState = {
  id?: string;
  fullName: string;
  subjects: string;
  specializations: string;
  phone: string;
  email: string;
  bio: string;
  startedAt: string;
  status: TeacherStatus;
  lessonPrice: string;
  teacherPay: string;
  defaultDurationMin: string;
  workDays: string;
  workInterval: string;
  adminNotes: string;
  photoUrl?: string | null;
};

function toForm(t?: Teacher): FormState {
  if (!t) {
    return {
      fullName: "",
      subjects: "",
      specializations: "",
      phone: "",
      email: "",
      bio: "",
      startedAt: "",
      status: "active",
      lessonPrice: "",
      teacherPay: "",
      defaultDurationMin: "60",
      workDays: "1,2,3,4,5",
      workInterval: "10:00-20:00",
      adminNotes: "",
      photoUrl: null,
    };
  }
  return {
    id: t.id,
    fullName: t.fullName,
    subjects: t.subjects.join(", "),
    specializations: (t.specializations ?? []).join(", "),
    phone: t.phone ?? "",
    email: t.email ?? "",
    bio: t.bio ?? "",
    startedAt: t.startedAt ? t.startedAt.slice(0, 10) : "",
    status: t.status,
    lessonPrice: t.lessonPrice != null ? String(t.lessonPrice) : "",
    teacherPay: t.teacherPay != null ? String(t.teacherPay) : "",
    defaultDurationMin: String(t.defaultDurationMin ?? 60),
    workDays: (t.workDays ?? []).join(","),
    workInterval: t.workIntervals?.[0]
      ? `${t.workIntervals[0].start}-${t.workIntervals[0].end}`
      : "",
    adminNotes: t.adminNotes ?? "",
    photoUrl: t.photoUrl,
  };
}

export function TeachersWorkspace() {
  const { data, upsertTeacher, deleteTeacher, studentsForTeacher } = useDemoStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(toForm());

  const rows = useMemo(
    () =>
      data.teachers
        .filter((t) =>
          !query.trim()
            ? true
            : t.fullName.toLowerCase().includes(query.toLowerCase()) ||
              t.subjects.some((s) =>
                s.toLowerCase().includes(query.toLowerCase())
              )
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")),
    [data.teachers, query]
  );

  function save() {
    if (!form.fullName.trim()) return;
    const [start, end] = form.workInterval.split("-").map((s) => s.trim());
    upsertTeacher({
      id: form.id,
      fullName: form.fullName.trim(),
      avatarInitials: initialsFromName(form.fullName),
      bio: form.bio.trim() || undefined,
      subjects: form.subjects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      specializations: form.specializations
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      startedAt: form.startedAt
        ? new Date(form.startedAt).toISOString()
        : undefined,
      status: form.status,
      lessonPrice: form.lessonPrice ? Number(form.lessonPrice) : undefined,
      teacherPay: form.teacherPay ? Number(form.teacherPay) : undefined,
      defaultDurationMin: form.defaultDurationMin
        ? Number(form.defaultDurationMin)
        : 60,
      workDays: form.workDays
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => n >= 1 && n <= 7),
      workIntervals:
        start && end ? [{ start, end }] : undefined,
      adminNotes: form.adminNotes.trim() || undefined,
    });
    setOpen(false);
  }

  async function uploadPhoto(file: File | null) {
    if (!file || !form.id) {
      toast.error("Сначала сохраните карточку преподавателя");
      return;
    }
    try {
      const csrf = await ensureCsrfToken();
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/teachers/${form.id}/photo`, {
        method: "POST",
        headers: { "x-csrf-token": csrf },
        credentials: "include",
        body,
      });
      const data = (await res.json().catch(() => ({}))) as {
        photoUrl?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      setForm((f) => ({ ...f, photoUrl: data.photoUrl }));
      toast.success("Фото загружено");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить фото");
    }
  }

  return (
    <div>
      <PageHeader
        title="Преподаватели"
        description="Рабочие карточки преподавателей: контакты, ставки, расписание и ученики."
        actions={
          <Button
            type="button"
            className="rounded-full"
            onClick={() => {
              setForm(toForm());
              setOpen(true);
            }}
          >
            Добавить преподавателя
          </Button>
        }
      />

      <FilterBar>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          className="border-transparent bg-background sm:max-w-xs"
        />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="Нет преподавателей" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Преподаватель</TableHead>
              <TableHead>Предметы</TableHead>
              <TableHead>Учеников</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Аккаунт</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="surface-sky flex size-9 items-center justify-center rounded-full text-xs font-semibold">
                      {t.avatarInitials || initialsFromName(t.fullName)}
                    </span>
                    <div>
                      <Link
                        href={`/direkciya/teachers/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.fullName}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {t.email || t.phone || "—"}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{t.subjects.join(", ") || "—"}</TableCell>
                <TableCell className="tabular-nums">
                  {studentsForTeacher(t.id).length}
                </TableCell>
                <TableCell>
                  <TeacherStatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.accountEmail ? (
                    <>
                      <div>{t.accountEmail}</div>
                      <div>роль: teacher</div>
                    </>
                  ) : (
                    "нет входа"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <EnterCabinetButton
                      userId={t.userId}
                      teacherId={t.id}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm(toForm(t));
                        setOpen(true);
                      }}
                    >
                      Изменить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Редактировать преподавателя" : "Новый преподаватель"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>ФИО</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Предметы</Label>
              <Input
                value={form.subjects}
                onChange={(e) => setForm({ ...form, subjects: e.target.value })}
                placeholder="через запятую"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Специализации</Label>
              <Input
                value={form.specializations}
                onChange={(e) =>
                  setForm({ ...form, specializations: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Описание для учеников</Label>
              <Textarea
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Коротко о подходе и опыте"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Фотография</Label>
              {form.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.photoUrl}
                  alt=""
                  className="mb-2 size-16 rounded-xl object-cover"
                />
              ) : null}
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={!form.id}
                onChange={(e) =>
                  void uploadPhoto(e.target.files?.[0] ?? null)
                }
              />
              {!form.id ? (
                <p className="text-xs text-muted-foreground">
                  Сохраните преподавателя, затем загрузите фото.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Дата начала работы</Label>
              <Input
                type="date"
                value={form.startedAt}
                onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  v && setForm({ ...form, status: v as TeacherStatus })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      teacherStatusLabel[v as TeacherStatus] ?? "Статус"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {teacherStatusLabel.active}
                  </SelectItem>
                  <SelectItem value="inactive">
                    {teacherStatusLabel.inactive}
                  </SelectItem>
                  <SelectItem value="archived">
                    {teacherStatusLabel.archived}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Стоимость для ученика</Label>
              <Input
                value={form.lessonPrice}
                onChange={(e) =>
                  setForm({ ...form, lessonPrice: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Вознаграждение преподавателя</Label>
              <Input
                value={form.teacherPay}
                onChange={(e) =>
                  setForm({ ...form, teacherPay: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Длительность по умолчанию (мин)</Label>
              <Input
                value={form.defaultDurationMin}
                onChange={(e) =>
                  setForm({ ...form, defaultDurationMin: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Рабочие дни (1–7 через запятую)</Label>
              <Input
                value={form.workDays}
                onChange={(e) => setForm({ ...form, workDays: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Интервал (например 10:00-20:00)</Label>
              <Input
                value={form.workInterval}
                onChange={(e) =>
                  setForm({ ...form, workInterval: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Заметки администратора</Label>
              <Textarea
                value={form.adminNotes}
                onChange={(e) =>
                  setForm({ ...form, adminNotes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {form.id ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  deleteTeacher(form.id!);
                  setOpen(false);
                }}
              >
                Удалить
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={save}>
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
