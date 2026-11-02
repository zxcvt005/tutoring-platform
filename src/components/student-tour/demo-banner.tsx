"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { useDemoStore } from "@/lib/store/demo-store";

export function StudentTourBanner() {
  const { resetDemo } = useDemoStore();

  return (
    <div className="relative z-30 border-b border-amber-500/30 bg-amber-50/95 text-amber-950 backdrop-blur-sm dark:bg-amber-950/40 dark:text-amber-50">
      <div className="mx-auto flex w-full max-w-[92rem] flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8">
        <p className="text-sm">
          <span className="font-semibold">Демонстрационный режим.</span>{" "}
          Данные учебные, изменения не сохраняются в школе.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-amber-700/30 bg-transparent"
            onClick={() => resetDemo()}
          >
            Сбросить демо
          </Button>
          <Link
            href="/#apply"
            className={buttonVariants({
              size: "sm",
              className: "h-8 rounded-lg",
            })}
          >
            Записаться
          </Link>
        </div>
      </div>
    </div>
  );
}
