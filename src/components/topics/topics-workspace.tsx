"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { TopicStatusBadge } from "@/components/status-badge";
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
import { useDemoStore } from "@/lib/store/demo-store";
import type { Topic, TopicStatus } from "@/lib/types";

export function TopicsWorkspace() {
  const {
    data,
    topicsForTeacher,
    homeworksForTopic,
    upsertTopic,
    deleteTopic,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TopicStatus>("active");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: undefined as string | undefined,
    title: "",
    subject: "",
    description: "",
    programNote: "",
    status: "active" as TopicStatus,
  });

  const rows = useMemo(() => {
    return topicsForTeacher(teacherId)
      .filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }, [topicsForTeacher, teacherId, statusFilter, query]);

  function openCreate() {
    const teacher = data.teachers.find((t) => t.id === teacherId);
    setForm({
      id: undefined,
      title: "",
      subject: teacher?.subjects[0] ?? "",
      description: "",
      programNote: "",
      status: "active",
    });
    setOpen(true);
  }

  function openEdit(t: Topic) {
    setForm({
      id: t.id,
      title: t.title,
      subject: t.subject,
      description: t.description ?? "",
      programNote: t.programNote ?? "",
      status: t.status,
    });
    setOpen(true);
  }

  function save() {
    if (!form.title.trim() || !form.subject.trim()) return;
    upsertTopic({
      id: form.id,
      teacherId,
      title: form.title.trim(),
      subject: form.subject.trim(),
      description: form.description.trim() || undefined,
      programNote: form.programNote.trim() || undefined,
      status: form.status,
    });
    setOpen(false);
  }

  function topicStats(topicId: string) {
    const hws = homeworksForTopic(topicId);
    const assignments = data.homeworkAssignments.filter(
      (a) => a.topicId === topicId
    );
    const lessons = data.lessons.filter((l) => l.topicId === topicId);
    const doneHw = assignments.filter(
      (a) => a.status === "completed" || a.status === "reviewed"
    ).length;
    return {
      hwCount: hws.filter((h) => h.status === "active").length,
      assigned: assignments.length,
      doneHw,
      lessons: lessons.length,
    };
  }

  return (
    <div>
      <PageHeader
        title="Темы"
        description="Учебные темы, домашние задания и история прохождения."
        actions={
          <Button type="button" className="rounded-full" onClick={openCreate}>
            Новая тема
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
        <Select
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v as "all" | TopicStatus)}
        >
          <SelectTrigger className="w-full border-transparent bg-background sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="archived">Архив</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="Нет тем" description="Создайте первую тему." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тема</TableHead>
              <TableHead>Предмет</TableHead>
              <TableHead>ДЗ</TableHead>
              <TableHead>Назначено / сдано</TableHead>
              <TableHead>Занятий</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => {
              const st = topicStats(t.id);
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/kafedra/topics/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.title}
                    </Link>
                  </TableCell>
                  <TableCell>{t.subject}</TableCell>
                  <TableCell className="tabular-nums">{st.hwCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {st.assigned} / {st.doneHw}
                  </TableCell>
                  <TableCell className="tabular-nums">{st.lessons}</TableCell>
                  <TableCell>
                    <TopicStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(t)}
                    >
                      Изменить
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Редактировать тему" : "Новая тема"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Предмет</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Связь с программой</Label>
              <Input
                value={form.programNote}
                onChange={(e) =>
                  setForm({ ...form, programNote: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  v && setForm({ ...form, status: v as TopicStatus })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активна</SelectItem>
                  <SelectItem value="archived">В архиве</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {form.id ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  deleteTopic(form.id!);
                  setOpen(false);
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
