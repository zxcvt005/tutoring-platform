"use client";

import { FormEvent, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Tariff, TariffFeatureKey, TariffPurchaseOption } from "@/lib/types";

const FEATURE_LABELS: Record<TariffFeatureKey, string> = {
  individual_lessons: "Индивидуальные занятия",
  homework: "Домашние задания",
  group_calls: "Групповые созвоны",
  intensives: "Интенсивы",
  extra_materials: "Доп. материалы",
  extra_tests: "Доп. тесты",
};

const ALL_FEATURES = Object.keys(FEATURE_LABELS) as TariffFeatureKey[];

type OptionDraft = {
  key: string;
  id?: string;
  lessonsCount: string;
  totalPrice: string;
  sortOrder: string;
  isActive: boolean;
};

type FormState = {
  id?: string;
  name: string;
  directionId: string;
  includesText: string;
  status: "active" | "archived";
  productIds: string[];
  features: TariffFeatureKey[];
  options: OptionDraft[];
};

function newOptionDraft(sort: number): OptionDraft {
  return {
    key: `opt_${Math.random().toString(36).slice(2, 9)}`,
    lessonsCount: "8",
    totalPrice: "16000",
    sortOrder: String(sort),
    isActive: true,
  };
}

function optionsFromTariff(t?: Tariff): OptionDraft[] {
  const opts = t?.purchaseOptions ?? [];
  if (opts.length === 0) return [newOptionDraft(0)];
  return [...opts]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((o, index) => ({
      key: o.id,
      id: o.id,
      lessonsCount: String(o.lessonsCount),
      totalPrice: String(o.totalPrice),
      sortOrder: String(o.sortOrder ?? index),
      isActive: o.isActive,
    }));
}

function toForm(t?: Tariff, defaultDirectionId?: string): FormState {
  if (!t) {
    return {
      name: "",
      directionId: defaultDirectionId ?? "",
      includesText: "",
      status: "active",
      productIds: [],
      features: ["individual_lessons", "homework"],
      options: [newOptionDraft(0)],
    };
  }
  return {
    id: t.id,
    name: t.name,
    directionId: t.directionId,
    includesText: t.includesText ?? "",
    status: t.status,
    productIds: [...(t.productIds ?? [])],
    features: [...(t.features ?? ["individual_lessons", "homework"])],
    options: optionsFromTariff(t),
  };
}

function unitPrice(total: number, lessons: number): string {
  if (!lessons) return "—";
  const v = Math.round((total / lessons) * 100) / 100;
  return `${v.toLocaleString("ru-RU")} ₽`;
}

function optionSummary(options?: TariffPurchaseOption[]): string {
  const active = (options ?? []).filter((o) => o.isActive);
  if (active.length === 0) return "Нет вариантов";
  const prices = active.map((o) => o.totalPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `${min.toLocaleString("ru-RU")} ₽`;
  return `${min.toLocaleString("ru-RU")}–${max.toLocaleString("ru-RU")} ₽`;
}

export function TariffsWorkspace() {
  const { data, ready } = useDemoStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const directions = data.learningDirections ?? [];
  const defaultDirectionId =
    directions.find((d) => d.status === "active")?.id ?? "";

  const [form, setForm] = useState<FormState>(
    toForm(undefined, defaultDirectionId)
  );

  const directionName = useMemo(() => {
    const map = new Map(directions.map((d) => [d.id, d.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [directions]);

  const rows = useMemo(
    () =>
      [...data.tariffs].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [data.tariffs]
  );

  const catalogProducts = useMemo(
    () =>
      [...(data.products ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "ru")
      ),
    [data.products]
  );

  async function reload() {
    window.location.reload();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.directionId) {
      toast.error("Выберите направление");
      return;
    }
    const purchaseOptions = form.options.map((o, index) => {
      const lessonsCount = Number(o.lessonsCount);
      const totalPrice = Number(o.totalPrice);
      if (!lessonsCount || lessonsCount < 1 || Number.isNaN(totalPrice)) {
        throw new Error("Проверьте варианты покупки");
      }
      return {
        id: o.id,
        lessonsCount,
        totalPrice,
        sortOrder: Number(o.sortOrder) || index,
        isActive: o.isActive,
      };
    });

    setBusy(true);
    try {
      await apiPlatform("upsertTariff", {
        id: form.id,
        directionId: form.directionId,
        name: form.name.trim(),
        includesText: form.includesText,
        features: form.features,
        status: form.status,
        productIds: form.productIds,
        purchaseOptions,
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

  function updateOption(
    key: string,
    patch: Partial<OptionDraft>
  ) {
    setForm((current) => ({
      ...current,
      options: current.options.map((o) =>
        o.key === key ? { ...o, ...patch } : o
      ),
    }));
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Тарифы"
        description="Тариф привязан к направлению. Продажа идёт через варианты покупки: количество занятий и сумма."
        actions={
          <Button
            type="button"
            className="rounded-full"
            disabled={directions.length === 0}
            onClick={() => {
              setForm(toForm(undefined, defaultDirectionId));
              setOpen(true);
            }}
          >
            Новый тариф
          </Button>
        }
      />

      {directions.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Сначала создайте направление в разделе «Направления».
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Нет тарифов" description="Создайте первый тариф." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Направление</TableHead>
              <TableHead>Варианты</TableHead>
              <TableHead>Суммы</TableHead>
              <TableHead>Заказов</TableHead>
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
                <TableCell>
                  {t.directionName ?? directionName(t.directionId)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {(t.purchaseOptions ?? []).filter((o) => o.isActive).length}
                </TableCell>
                <TableCell className="tabular-nums">
                  {optionSummary(t.purchaseOptions)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {t.activeOrderCount ?? 0}
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
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 border-b px-4 py-3">
              <DialogTitle>
                {form.id ? "Редактировать тариф" : "Новый тариф"}
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label>Направление</Label>
                  <Select
                    value={form.directionId || "__none__"}
                    onValueChange={(v) =>
                      v &&
                      setForm({
                        ...form,
                        directionId: v === "__none__" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(v) =>
                          !v || v === "__none__"
                            ? "Выберите направление"
                            : (directionName(v) ?? "—")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Не выбрано</SelectItem>
                      {directions
                        .filter((d) => d.status === "active")
                        .map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Название</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                <div className="space-y-2 rounded-xl border border-border/70 p-3">
                  <Label>Возможности тарифа</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ALL_FEATURES.map((key) => {
                      const checked = form.features.includes(key);
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              const on = value === true;
                              setForm((current) => ({
                                ...current,
                                features: on
                                  ? [...new Set([...current.features, key])]
                                  : current.features.filter((f) => f !== key),
                              }));
                            }}
                          />
                          {FEATURE_LABELS[key]}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Варианты покупки</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 rounded-lg"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          options: [
                            ...current.options,
                            newOptionDraft(current.options.length),
                          ],
                        }))
                      }
                    >
                      <Plus className="size-3.5" />
                      Добавить
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Занятий</TableHead>
                          <TableHead>Сумма, ₽</TableHead>
                          <TableHead>За занятие</TableHead>
                          <TableHead>Порядок</TableHead>
                          <TableHead>Активен</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {form.options.map((o) => {
                          const lessons = Number(o.lessonsCount) || 0;
                          const total = Number(o.totalPrice) || 0;
                          return (
                            <TableRow key={o.key}>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={1}
                                  className="w-24"
                                  value={o.lessonsCount}
                                  onChange={(e) =>
                                    updateOption(o.key, {
                                      lessonsCount: e.target.value,
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  className="w-28"
                                  value={o.totalPrice}
                                  onChange={(e) =>
                                    updateOption(o.key, {
                                      totalPrice: e.target.value,
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-sm tabular-nums text-muted-foreground">
                                {unitPrice(total, lessons)}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="w-20"
                                  value={o.sortOrder}
                                  onChange={(e) =>
                                    updateOption(o.key, {
                                      sortOrder: e.target.value,
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Checkbox
                                  checked={o.isActive}
                                  onCheckedChange={(value) =>
                                    updateOption(o.key, {
                                      isActive: value === true,
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                {form.options.length > 1 ? (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    onClick={() =>
                                      setForm((current) => ({
                                        ...current,
                                        options: current.options.filter(
                                          (x) => x.key !== o.key
                                        ),
                                      }))
                                    }
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 p-3">
                  <Label>Дополнительные продукты</Label>
                  {catalogProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      В каталоге пока нет продуктов.
                    </p>
                  ) : (
                    <div className="grid max-h-40 gap-2 overflow-y-auto">
                      {catalogProducts.map((product) => {
                        const checked = form.productIds.includes(product.id);
                        return (
                          <label
                            key={product.id}
                            className="flex items-start gap-2 rounded-lg px-1 py-1 text-sm"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={(value) => {
                                const on = value === true;
                                setForm((current) => ({
                                  ...current,
                                  productIds: on
                                    ? [
                                        ...new Set([
                                          ...current.productIds,
                                          product.id,
                                        ]),
                                      ]
                                    : current.productIds.filter(
                                        (id) => id !== product.id
                                      ),
                                }));
                              }}
                            />
                            <span className="min-w-0">
                              <span className="block font-medium">
                                {product.name}
                              </span>
                              {product.description ? (
                                <span className="block text-xs text-muted-foreground">
                                  {product.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 border-t px-4 py-3">
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