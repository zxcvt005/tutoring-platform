import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SLOT_PAY_PRESENT_COUNTS } from "@/lib/teacher-slot";

export type SlotRateForm = Record<`rate${1 | 2 | 3 | 4 | 5}`, string>;

export const emptySlotRateForm: SlotRateForm = {
  rate1: "",
  rate2: "",
  rate3: "",
  rate4: "",
  rate5: "",
};

export function SlotPayRatesFields({
  value,
  onChange,
}: {
  value: SlotRateForm;
  onChange: (next: SlotRateForm) => void;
}) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Заработок за слот, ₽</Label>
      <p className="text-xs text-muted-foreground">
        Сумма зависит от числа фактически присутствовавших учеников, а не от
        записей в расписании. Пустые поля — ставки не настроены.
      </p>
      <div className="grid gap-2 sm:grid-cols-5">
        {SLOT_PAY_PRESENT_COUNTS.map((count) => {
          const key = `rate${count}` as const;
          return (
            <div key={count} className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {count === 1
                  ? "1 ученик"
                  : count === 5
                    ? "5 учеников"
                    : `${count} ученика`}
              </Label>
              <Input
                inputMode="decimal"
                placeholder="—"
                value={value[key]}
                onChange={(e) =>
                  onChange({ ...value, [key]: e.target.value })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
