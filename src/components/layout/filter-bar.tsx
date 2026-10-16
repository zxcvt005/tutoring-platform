import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Единая полоса фильтров для рабочих списков. */
export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/35 p-2.5 sm:flex-row sm:flex-wrap sm:items-center",
        className
      )}
    >
      {children}
    </div>
  );
}
