"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LearningDirection, Tariff } from "@/lib/types";

export function assignableTariffs(
  tariffs: Tariff[],
  directions: LearningDirection[] = []
): Array<{ id: string; label: string }> {
  const directionName = new Map(directions.map((d) => [d.id, d.name]));
  return [...tariffs]
    .filter((t) => t.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((t) => {
      const dir = directionName.get(t.directionId);
      return {
        id: t.id,
        label: dir ? `${t.name} · ${dir}` : t.name,
      };
    });
}

export function AssignedTariffField({
  value,
  tariffs,
  directions,
  onChange,
}: {
  value: string;
  tariffs: Tariff[];
  directions: LearningDirection[];
  onChange: (tariffId: string) => void;
}) {
  const options = assignableTariffs(tariffs, directions);
  return (
    <div className="space-y-1.5">
      <Label>Назначенный тариф</Label>
      <Select
        value={value || "__none__"}
        onValueChange={(v) => {
          if (!v) return;
          onChange(v === "__none__" ? "" : v);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {(v) => {
              if (!v || v === "__none__") return "Не назначен — все тарифы";
              return options.find((o) => o.id === v)?.label ?? "—";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Не назначен — все тарифы</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Если тариф назначен, ученик на оплате видит только его пакеты.
      </p>
    </div>
  );
}
