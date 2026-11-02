"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Product } from "@/lib/types";

type FormState = {
  id?: string;
  name: string;
  description: string;
  isActive: boolean;
  slug?: string;
};

function toForm(p?: Product): FormState {
  if (!p) {
    return { name: "", description: "", isActive: true };
  }
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    slug: p.slug,
  };
}

export function ProductsWorkspace() {
  const { data, ready } = useDemoStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(toForm());
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => [...(data.products ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [data.products]
  );

  async function reload() {
    window.location.reload();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPlatform("upsertProduct", {
        id: form.id,
        name: form.name,
        description: form.description,
        isActive: form.isActive,
      });
      toast.success("Продукт сохранён");
      setOpen(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(product: Product, isActive: boolean) {
    setBusy(true);
    try {
      await apiPlatform("upsertProduct", {
        id: product.id,
        name: product.name,
        description: product.description,
        isActive,
      });
      toast.success(isActive ? "Продукт включён" : "Продукт отключён");
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
        title="Продукты"
        description="Дополнительные сервисы школы. Подключаются к тарифам и выдаются ученикам по текущему назначению."
        actions={
          <Button
            type="button"
            className="rounded-full"
            onClick={() => {
              setForm(toForm());
              setOpen(true);
            }}
          >
            Новый продукт
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Нет продуктов"
          description="Добавьте первый продукт в каталог."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Описание</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Тарифы</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {p.slug}
                  </div>
                  {!p.implemented ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Функциональность ещё не подключена
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="max-w-sm text-sm text-muted-foreground">
                    {p.description || "—"}
                  </div>
                </TableCell>
                <TableCell>{p.isActive ? "Активен" : "Отключён"}</TableCell>
                <TableCell>
                  <div className="tabular-nums">{p.tariffCount ?? 0}</div>
                  {p.tariffNames && p.tariffNames.length > 0 ? (
                    <div className="max-w-xs truncate text-xs text-muted-foreground">
                      {p.tariffNames.join(", ")}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm(toForm(p));
                        setOpen(true);
                      }}
                    >
                      Изменить
                    </Button>
                    {p.isActive ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void setActive(p, false)}
                      >
                        Отключить
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void setActive(p, true)}
                      >
                        Включить
                      </Button>
                    )}
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
                {form.id ? "Редактировать продукт" : "Новый продукт"}
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
              {form.slug ? (
                <p className="font-mono text-xs text-muted-foreground">
                  Идентификатор: {form.slug}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Идентификатор будет создан автоматически и больше не изменится.
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Описание</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isActive}
                  onCheckedChange={(value) =>
                    setForm({ ...form, isActive: value === true })
                  }
                />
                Активен
              </label>
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
