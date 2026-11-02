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
export function StudentTourShell({ children }: { children: ReactNode }) {
  const { ready } = useDemoStore();
  const [open, setOpen] = useState(false);

  return (
    <AuditoriaBackgroundProvider>
      <div className="flex min-h-full flex-1 flex-col bg-background">
        <StudentTourBanner />
        <div className="relative flex min-h-0 flex-1 overflow-x-hidden">
          <AuditoriaBackgroundLayer />
          <aside className={cabinetAsideClassName("auditoria")}>
            <div className={cabinetAsidePanelClassName("auditoria")}>
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
                <AppSidebar
                  role="auditoria"
                  navBasePath={STUDENT_TOUR_BASE_PATH}
                  logoutLabel="На сайт"
                />
              </div>
            </div>
          </aside>

          <div className="relative z-10 flex min-w-0 flex-1 flex-col">
            <header
              data-cabinet-header=""
              className="relative z-20 flex items-center gap-3 border-b border-border/80 px-4 py-3 md:absolute md:top-3 md:right-3 md:z-30 md:border-0 md:bg-transparent md:p-0"
            >
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="md:hidden"
                onClick={() => setOpen(true)}
                aria-label="Открыть меню"
              >
                <Menu />
              </Button>
              <span className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight md:hidden">
                Аудитория · демо
              </span>
              <div className="ml-auto">
                <AuditoriaBackgroundPicker />
              </div>
            </header>

            <Sheet open={open} onOpenChange={setOpen}>
              <SheetContent
                side="left"
                className={cn("w-72 p-0", cabinetMobileSheetClassName("auditoria"))}
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

            <main className="relative z-10 flex-1 overflow-x-hidden pt-3 pb-24 pl-4 pr-4 max-md:pr-16 max-md:pb-32 sm:pl-6 sm:pb-20 md:pr-16 md:pb-20 lg:pl-8">
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
