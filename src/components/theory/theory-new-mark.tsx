import { cn } from "@/lib/utils";

export function TheoryNewMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-[0.7rem] font-bold leading-none text-success-foreground",
        className
      )}
      title="Новая теория — ещё не изучена"
      aria-label="Новая теория, ещё не изучена"
    >
      !
    </span>
  );
}
