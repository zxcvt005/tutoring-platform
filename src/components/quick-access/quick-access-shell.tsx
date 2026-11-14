"use client";

import type { ReactNode } from "react";

import { BrandMark } from "@/components/landing/brand-mark";
import { QUICK_ACCESS_LABELS, type QuickAccessType } from "@/lib/quick-access";
import { cn } from "@/lib/utils";

export function QuickAccessShell({
  accessType,
  children,
}: {
  accessType: QuickAccessType;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "quick-access-shell min-h-dvh bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_55%),linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--muted)_35%,var(--background)))]",
        "text-foreground antialiased"
      )}
    >
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 px-3 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:px-5">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">
                Быстрый доступ · {QUICK_ACCESS_LABELS[accessType]}
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-6">
        {children}
      </main>
    </div>
  );
}
