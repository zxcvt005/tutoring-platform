"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { LearningDirection } from "@/lib/types";

type FormState = {
  id?: string;
  name: string;
  slug: string;
  status: "active" | "archived";
};

function toForm(d?: LearningDirection): FormState {
  if (!d) {
    return { name: "", slug: "", status: "active" };
  }
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    status: d.status,
  };
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function DirectionsWorkspace() {
  const { data, ready } = useDemoStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(toForm());
  const [busy, setBusy] = useState(false);

  const directions = data.learningDirections ?? [];

  const tariffCountByDirection = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of data.tariffs ?? []) {
      if (!t.directionId) continue;
      map.set(t.directionId, (map.get(t.directionId) ?? 0) + 1);
    }
    return map;
  }, [data.tariffs]);

  const rows = useMemo(
    () =>
      [...directions].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [directions]
  );

  async function reload() {
    window.location.reload();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPlatform("upsertLearningDirection", {
        id: form.id,
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name),
        status: form.status,
      });
      toast.success("Направление сохранено");
      setOpen(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setBusy(true);
    try {
      await apiPlatform("archiveLearningDirection", { id });
      toast.success("Направление архивировано");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Направления"
        description="Учебные направления: к ним привязываются тарифы, варианты покупки и баланс занятий ученика."
        actions={
          <Button
            type="button"
            className="rounded-full"
            onClick={() => {
              setForm(toForm());
              setOpen(true);
            }}
          >
            Новое направление
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Нет направлений"
          description="Создайте направление, затем настройте тарифы с вариантами покупки."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Код</TableHead>
              <TableHead>Тарифов</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {d.slug}
                </TableCell>
                <TableCell className="tabular-nums">
                  {tariffCountByDirection.get(d.id) ?? 0}
                </TableCell>
                <TableCell>
                  {d.status === "active" ? "Активно" : "Архив"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm(toForm(d));
                        setOpen(true);
                      }}
                    >
                      Изменить
                    </Button>
                    {d.status === "active" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void archive(d.id)}
                      >
                        В архив
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>
                {form.id ? "Редактировать направление" : "Новое направление"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1.5">
                <Label>Название</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name: e.target.value,
                      slug: form.id ? form.slug : slugify(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Код (slug)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="physics"
                />
                <p className="text-xs text-muted-foreground">
                  Латиница и дефисы; используется в ссылках и фильтрах.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-xl" disabled={busy}>
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}