"use client";

import type { MouseEvent, ReactNode } from "react";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a,button,input,textarea,select,[role='checkbox'],[role='combobox'],[role='option'],[data-slot='select-trigger'],[contenteditable='true']"
    )
  );
}

/**
 * Строка таблицы Дирекции: клик по «пустой» области раскрывает/сворачивает.
 * Клики по контролам редактирования не переключают раскрытие.
 */
export function ExpandableTableRow({
  expanded,
  onToggle,
  className,
  children,
  ...rest
}: {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof TableRow>, "onClick" | "children">) {
  function handleClick(e: MouseEvent<HTMLTableRowElement>) {
    if (isInteractiveTarget(e.target)) return;
    onToggle();
  }

  return (
    <TableRow
      aria-expanded={expanded}
      data-state={expanded ? "selected" : undefined}
      className={cn(
        "cursor-pointer align-top",
        expanded ? "h-auto bg-muted/25" : "h-9",
        className
      )}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </TableRow>
  );
}
