"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";

import {
  AuditoriaBackgroundLayer,
  AuditoriaBackgroundPicker,
  AuditoriaBackgroundProvider,
} from "@/components/auditoria/auditoria-background";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { StudentTourBanner } from "@/components/student-tour/demo-banner";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  cabinetAsideClassName,
  cabinetAsidePanelClassName,
  cabinetMobileSheetClassName,
} from "@/lib/cabinet-shell-classes";
import { STUDENT_TOUR_BASE_PATH } from "@/lib/student-tour/constants";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

/**
 * Оболочка Аудитории для публичного демо.
 * Без чата, заметок и impersonation — только локальный store.
 */
export function StudentTourShell({
  children,
  variant = "page",
}: {
  children: ReactNode;
  variant?: "page" | "embedded";
}) {
  const { ready } = useDemoStore();
  const [open, setOpen] = useState(false);
  const embedded = variant === "embedded";

  return (
    <AuditoriaBackgroundProvider>
      <div
        className={cn(
          "flex flex-1 flex-col bg-background",
          embedded ? "h-full min-h-0 overflow-hidden" : "min-h-full"
        )}
        data-student-tour-shell={variant}
      >
        {embedded ? null : <StudentTourBanner />}
        <div
          className={cn(
            "relative flex min-h-0 flex-1 overflow-x-hidden",
            embedded && "h-full"
          )}
        >
          <AuditoriaBackgroundLayer />
          <aside
            className={cn(
              cabinetAsideClassName("auditoria"),
              embedded && "!flex sticky top-0 !h-full self-stretch"
            )}
          >
            <div className={cabinetAsidePanelClassName("auditoria")}>
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
                <AppSidebar
                  role="auditoria"
                  navBasePath={STUDENT_TOUR_BASE_PATH}
                  logoutLabel={embedded ? "На лендинг" : "На сайт"}
                />
              </div>
            </div>
          </aside>

          <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
            <header
              data-cabinet-header=""
              className={cn(
                "relative z-20 flex items-center gap-3 border-b border-border/80 px-4 py-3 md:absolute md:top-3 md:right-3 md:z-30 md:border-0 md:bg-transparent md:p-0",
                embedded && "md:top-3 md:right-3"
              )}
            >
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className={cn(embedded ? "hidden" : "md:hidden")}
                onClick={() => setOpen(true)}
                aria-label="Открыть меню"
              >
                <Menu />
              </Button>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight",
                  embedded ? "hidden" : "md:hidden"
                )}
              >
                Аудитория · демо
              </span>
              <div className="ml-auto">
                <AuditoriaBackgroundPicker />
              </div>
            </header>

            {embedded ? null : (
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent
                  side="left"
                  className={cn(
                    "w-72 p-0",
                    cabinetMobileSheetClassName("auditoria")
                  )}
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Меню демо-кабинета</SheetTitle>
                  </SheetHeader>
                  <AppSidebar
                    role="auditoria"
                    navBasePath={STUDENT_TOUR_BASE_PATH}
                    logoutLabel="На сайт"
                    onNavigate={() => setOpen(false)}
                  />
                </SheetContent>
              </Sheet>
            )}

            <main
              className={cn(
                "relative z-10 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-3 pb-24 pl-4 pr-4 max-md:pr-16 max-md:pb-32 sm:pl-6 sm:pb-20 md:pr-16 md:pb-20 lg:pl-8",
                embedded && "min-h-0 pb-10 max-md:pr-4 max-md:pb-10"
              )}
            >
              {!ready ? (
                <p className="relative z-10 inline-flex rounded-xl border border-black/10 bg-auditoria-surface px-3 py-2 text-sm text-muted-foreground">
                  Загрузка демо…
                </p>
              ) : (
                <div
                  className="relative z-10 mx-auto w-full max-w-[92rem]"
                  data-auditoria-workspace
                  data-student-tour
                >
                  <TooltipProvider delay={300} closeDelay={80}>
                    {children}
                  </TooltipProvider>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </AuditoriaBackgroundProvider>
  );
}
