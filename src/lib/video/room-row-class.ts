import { cn } from "@/lib/utils";

/** Active и hover — разные состояния: активная комната с кольцом, hover только у неактивных. */
export function roomRowClass(active: boolean) {
  return cn(
    "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors",
    active
      ? "bg-primary/20 font-medium text-foreground ring-1 ring-primary/45"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );
}
