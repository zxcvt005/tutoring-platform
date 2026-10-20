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
import { Textarea } from "@/components/ui/textarea";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Tariff } from "@/lib/types";

type FormState = {
  id?: string;
  name: string;
  price: string;
  durationDays: string;
  lessonsLimit: string;
  includesText: string;
  status: "active" | "archived";
};

function toForm(t?: Tariff): FormState {
  if (!t) {
    return {
      name: "",
      price: "",
      durationDays: "30",
      lessonsLimit: "",
      includesText: "",
      status: "active",
    };
  }
  return {
    id: t.id,
    name: t.name,
    price: String(t.price),
    durationDays: String(t.durationDays),
    lessonsLimit: t.lessonsLimit != null ? String(t.lessonsLimit) : "",
    includesText: t.includesText ?? "",
    status: t.status,
  };
}

export function TariffsWorkspace() {
  const { data, ready } = useDemoStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(toForm());
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () =>
      [...data.tariffs].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [data.tariffs]
  );

  async function reload() {
    window.location.reload();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPlatform("upsertTariff", {
        id: form.id,
        name: form.name,
        price: Number(form.price),
        durationDays: Number(form.durationDays),
        lessonsLimit: form.lessonsLimit ? Number(form.lessonsLimit) : null,
        includesText: form.includesText,
        features: ["individual_lessons", "homework"],
        status: form.status,
      });
      toast.success("Тариф сохранён");
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
      await apiPlatform("archiveTariff", { id });
      toast.success("Тариф архивирован");
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
        title="Тарифы"
        description="Продукты обучения: цена, срок и состав. Назначение ученику — отдельная запись."
        actions={
          <Button
            type="button"
            className="rounded-full"
            onClick={() => {
              setForm(toForm());
              setOpen(true);
            }}
          >
            Новый тариф
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Нет тарифов" description="Создайте первый тариф." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Цена</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead>Занятий</TableHead>
              <TableHead>Назначений</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  {t.includesText ? (
                    <div className="max-w-xs truncate text-xs text-muted-foreground">
                      {t.includesText}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="tabular-nums">
                  {t.price.toLocaleString("ru-RU")} ₽
                </TableCell>
                <TableCell className="tabular-nums">{t.durationDays} дн.</TableCell>
                <TableCell className="tabular-nums">
                  {t.lessonsLimit ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {t.assignedCount ?? 0}
                </TableCell>
                <TableCell>
                  {t.status === "active" ? "Активен" : "Архив"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
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
                    {t.status === "active" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void archive(t.id)}
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
                {form.id ? "Редактировать тариф" : "Новый тариф"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1.5">
                <Label>Название</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Стоимость, ₽</Label>
                  <Input
                    required
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Срок, дней</Label>
                  <Input
                    required
                    type="number"
                    min={1}
                    value={form.durationDays}
                    onChange={(e) =>
                      setForm({ ...form, durationDays: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Лимит занятий</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.lessonsLimit}
                  onChange={(e) =>
                    setForm({ ...form, lessonsLimit: e.target.value })
                  }
                  placeholder="необязательно"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Что входит</Label>
                <Textarea
                  rows={3}
                  value={form.includesText}
                  onChange={(e) =>
                    setForm({ ...form, includesText: e.target.value })
                  }
                />
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
