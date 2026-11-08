"use client";

import { useState } from "react";

import { RichTextWithMath } from "@/components/math/rich-text-with-math";
import { Button } from "@/components/ui/button";
import { EMPTY_EXPLANATION_MESSAGE } from "@/lib/math/rich-text-math";
import { cn } from "@/lib/utils";

/**
 * Разбор для ученика: кнопка всегда есть, если доступ разрешён.
 * Пустой разбор показывает «Тут пока ничего нет :(».
 */
export function ExplanationPanel({
  explanation,
  className,
  defaultOpen = false,
}: {
  explanation: string | null | undefined;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full border-black/10 bg-auditoria-surface"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {open ? "Скрыть разбор" : "Посмотреть разбор"}
      </Button>
      {open ? (
        <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Разбор</p>
          <RichTextWithMath
            text={explanation}
            emptyMessage={EMPTY_EXPLANATION_MESSAGE}
          />
        </div>
      ) : null}
    </div>
  );
}
