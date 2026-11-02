"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Полноэкранный каркас звонка на текущей странице.
 * Назад в кабинет не завершает звонок и не создаёт новое LiveKit-подключение.
 */
export function CallOverlay({
  cabinetHref,
  title,
  children,
  layout = "cabinet",
  backLabel = "В кабинет",
  showBack = true,
}: {
  cabinetHref: string;
  title: string;
  children: ReactNode;
  layout?: "cabinet" | "full";
  backLabel?: string;
  showBack?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, []);

  return (
    <div
      data-call-overlay=""
      className={cn(
        "fixed inset-0 z-40 flex min-w-0 flex-col overflow-hidden overflow-x-hidden overscroll-none bg-background",
        "max-md:w-full max-md:pt-[env(safe-area-inset-top)] max-md:pr-[env(safe-area-inset-right)] max-md:pb-[env(safe-area-inset-bottom)] max-md:pl-[env(safe-area-inset-left)]",
        layout === "cabinet"
          ? "md:inset-y-0 md:right-0 md:left-56 md:w-auto lg:left-[15rem]"
          : undefined
      )}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-1.5 md:hidden">
        {showBack ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-w-11 px-2 text-sm"
            onClick={() => router.push(cabinetHref)}
          >
            <ChevronLeft className="size-5" />
            {backLabel}
          </Button>
        ) : null}
        <p className="min-w-0 flex-1 truncate pr-2 text-sm font-medium">{title}</p>
      </header>
      {children}
    </div>
  );
}

export const callTileFrameClass = "min-w-0 w-full";

export const callControlClass = "max-md:size-12 max-md:rounded-xl";
