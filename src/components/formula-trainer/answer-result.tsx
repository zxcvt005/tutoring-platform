"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { FormulaMath } from "@/components/formula-trainer/formula-math";
import { CORRECT_ANSWER_CONFIRMATION } from "@/lib/formula-trainer/display";
import type { AnswerFeedback } from "@/lib/formula-trainer/types";
import { cn } from "@/lib/utils";

export function FormulaAnswerResult({
  feedback,
  action,
  variant = "default",
}: {
  feedback: AnswerFeedback;
  action?: ReactNode;
  variant?: "default" | "home";
}) {
  const ok = feedback.correct;
  const unverifiable = feedback.status === "unverifiable";
  const home = variant === "home";

  return (
    <div
      className={cn(
        home
          ? "flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          : "rounded-xl border px-3 py-2.5 text-sm",
        ok && "border-[#b7d7c4] bg-pastel-mint",
        !ok &&
          !unverifiable &&
          (home
            ? "border-[#f2d7d9] bg-pastel-rose"
            : "border-destructive/40 bg-destructive/5"),
        unverifiable &&
          (home
            ? "border-pastel-beige bg-pastel-beige"
            : "border-amber-500/40 bg-amber-500/5")
      )}
    >
      <div className="min-w-0">
        {ok ? (
          <div>
            <p className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
              <Check className="size-5" />
              {CORRECT_ANSWER_CONFIRMATION.title}
            </p>
            <p className="mt-1 text-sm text-foreground/80">
              {CORRECT_ANSWER_CONFIRMATION.detail}
            </p>
          </div>
        ) : (
          <p className={cn("font-medium", home && "font-display text-base")}>
            {unverifiable ? "Не удалось проверить" : "Неверно"}
          </p>
        )}
        {!ok ? (
          <div className={cn("mt-2 space-y-1.5", home && "space-y-2")}>
            <p className="text-xs text-muted-foreground">Правильная формула:</p>
            <FormulaMath
              className={home ? "text-base" : undefined}
              expression={feedback.correctExpression}
            />
            {feedback.explanation ? (
              <p className="text-sm leading-relaxed text-foreground/80">
                {feedback.explanation}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {action ? <div className={cn(ok && "mt-3")}>{action}</div> : null}
    </div>
  );
}
