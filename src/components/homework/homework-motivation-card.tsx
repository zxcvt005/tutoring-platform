import { Sprout } from "lucide-react";

import {
  homeworkMotivation,
  type HomeworkMotivationLevel,
} from "@/lib/homework-motivation";
import { cn } from "@/lib/utils";

const tone: Record<HomeworkMotivationLevel | "none", string> = {
  none: "bg-pastel-blue/70",
  1: "bg-pastel-blue",
  2: "bg-pastel-beige",
  3: "bg-[#eef6f1]",
  4: "bg-pastel-mint",
  5: "bg-pastel-beige",
};

export function HomeworkMotivationCard({
  percent,
  className,
}: {
  percent: number | null;
  className?: string;
}) {
  const message = homeworkMotivation(percent);
  const key = message.level ?? "none";

  return (
    <aside
      className={cn(
        "flex min-h-36 min-w-0 flex-col justify-center rounded-2xl px-4 py-4 sm:px-5",
        tone[key],
        className
      )}
    >
      <Sprout className="size-5 text-foreground/70" aria-hidden />
      {message.badge ? (
        <p className="mt-3 inline-flex w-fit rounded-full bg-auditoria-surface px-2.5 py-0.5 text-xs text-foreground/80">
          {message.badge}
        </p>
      ) : null}
      <p className="mt-2 font-display text-lg leading-tight font-semibold tracking-tight">
        {message.title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/75">
        {message.text}
      </p>
    </aside>
  );
}
