"use client";

import { ApplyButton } from "@/components/landing/apply-button";

export function LandingNextStep({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="mt-12 flex flex-col items-start justify-between gap-5 border-t border-border pt-8 sm:flex-row sm:items-end">
      <div className="max-w-xl">
        <p className="font-display text-2xl leading-snug font-semibold tracking-tight">
          {title}
        </p>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {text}
        </p>
      </div>
      <ApplyButton>Начать с диагностики</ApplyButton>
    </div>
  );
}
