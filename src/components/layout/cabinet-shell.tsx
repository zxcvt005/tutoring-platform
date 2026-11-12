"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import {
  AuditoriaBackgroundLayer,
  AuditoriaBackgroundPicker,
  AuditoriaBackgroundProvider,
} from "@/components/auditoria/auditoria-background";
import { ChatWidget } from "@/components/chat/chat-widget";
import { NotesWidget } from "@/components/notes/notes-widget";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { Button } from "@/components/ui/button";
import {
  HintTooltip,
  TooltipProvider,
} from "@/components/ui/tooltip";
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
import {
  readDirekciyaSidebarCollapsed,
  subscribeDirekciyaSidebarCollapsed,
  writeDirekciyaSidebarCollapsed,
} from "@/lib/direkciya-sidebar";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

export type CabinetRole =
  | "direkciya"
  | "kafedra"
  | "auditoria"
  | "pressa"
  | "assistent";

const titles: Record<CabinetRole, string> = {
  direkciya: "Дирекция",
  kafedra: "Кафедра",
  auditoria: "Аудитория",
  pressa: "Пресса",
  assistent: "Ассистент",
};

export function CabinetShell({
  role,
  children,
}: {
  role: CabinetRole;
  children: ReactNode;
}) {
  const { ready } = useDemoStore();
  const [open, setOpen] = useState(false);
  const title = titles[role];
  const canCollapseSidebar = role === "direkciya";
  const sidebarCollapsedStored = useSyncExternalStore(
    subscribeDirekciyaSidebarCollapsed,
    readDirekciyaSidebarCollapsed,
    () => false
  );
  const sidebarCollapsed = canCollapseSidebar && sidebarCollapsedStored;

  function toggleSidebarCollapsed() {
    writeDirekciyaSidebarCollapsed(!sidebarCollapsedStored);
  }

  const frame = (
    <TooltipProvider delay={300} closeDelay={80}>
    <div className="flex min-h-full flex-1 flex-col overflow-x-hidden bg-background">
      <ImpersonationBanner />
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 overflow-x-hidden",
          role === "auditoria" && "overflow-x-hidden"
        )}
      >
      {role === "auditoria" ? <AuditoriaBackgroundLayer /> : null}
      <aside
        className={cabinetAsideClassName(role, {
          collapsed: canCollapseSidebar && sidebarCollapsed,
        })}
      >
        {role === "auditoria" ? (
          <div className={cabinetAsidePanelClassName(role)}>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
              <AppSidebar role={role} />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-x-hidden">
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
              <AppSidebar
                role={role}
                collapsed={canCollapseSidebar && sidebarCollapsed}
              />
            </div>
            {canCollapseSidebar ? (
              <div
                className={cn(
                  "shrink-0 border-t border-sidebar-border p-2",
                  sidebarCollapsed && "flex justify-center"
                )}
              >
                <HintTooltip
                  text={
                    sidebarCollapsed
                      ? "Развернуть меню"
                      : "Свернуть меню"
                  }
                >
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="size-8 rounded-lg text-sidebar-foreground/80"
                    aria-label={
                      sidebarCollapsed
                        ? "Развернуть меню"
                        : "Свернуть меню"
                    }
                    aria-expanded={!sidebarCollapsed}
                    onClick={toggleSidebarCollapsed}
                  >
                    {sidebarCollapsed ? (
                      <PanelLeftOpen className="size-4" />
                    ) : (
                      <PanelLeftClose className="size-4" />
                    )}
                  </Button>
                </HintTooltip>
              </div>
            ) : null}
          </div>
        )}
      </aside>

      <CabinetContentColumn role={role} title={title} onOpenMenu={() => setOpen(true)}>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="left"
            className={cn("w-72 p-0", cabinetMobileSheetClassName(role))}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Меню {title}</SheetTitle>
            </SheetHeader>
            <AppSidebar role={role} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <main
          className={cn(
            "relative z-10 flex-1",
            role === "auditoria"
              ? "overflow-x-hidden pt-3 pb-24 pl-4 pr-4 max-md:pr-16 max-md:pb-32 sm:pl-6 sm:pb-20 md:pr-16 md:pb-20 lg:pl-8"
              : "px-4 py-4 pb-24 max-md:pr-16 sm:px-6 sm:py-5 lg:px-8 md:pb-20",
            role === "kafedra" ? "max-md:pb-32" : null
          )}
        >
          {!ready ? (
            <p
              className={cn(
                "relative z-10 text-sm text-muted-foreground",
                role === "auditoria" &&
                  "inline-flex rounded-xl border border-black/10 bg-auditoria-surface px-3 py-2"
              )}
            >
              Загрузка данных с сервера…
            </p>
          ) : (
            <div
              className={cn(
                "relative z-10 mx-auto w-full max-w-[92rem]"
              )}
              {...(role === "auditoria"
                ? { "data-auditoria-workspace": true }
                : {})}
            >
              {children}
            </div>
          )}
        </main>
      </CabinetContentColumn>
      </div>
      <NotesWidget
        offsetForChat={role === "kafedra" || role === "auditoria"}
      />
      {role === "kafedra" || role === "auditoria" ? (
        <ChatWidget role={role} />
      ) : null}
    </div>
    </TooltipProvider>
  );

  if (role !== "auditoria") {
    return frame;
  }

  return <AuditoriaBackgroundProvider>{frame}</AuditoriaBackgroundProvider>;
}

function CabinetContentColumn({
  role,
  title,
  onOpenMenu,
  children,
}: {
  role: CabinetRole;
  title: string;
  onOpenMenu: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col",
        role === "auditoria" && "z-10"
      )}
    >
      <header
        data-cabinet-header=""
        className={cn(
          "relative z-20 flex items-center gap-3 border-b border-border/80 px-4 py-3",
          role === "auditoria"
            ? "md:absolute md:top-3 md:right-3 md:z-30 md:border-0 md:bg-transparent md:p-0"
            : "md:hidden"
        )}
      >
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="md:hidden"
          onClick={onOpenMenu}
          aria-label="Открыть меню"
        >
          <Menu />
        </Button>
        <span className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight md:hidden">
          {title}
        </span>
        {role === "auditoria" ? (
          <div className="ml-auto">
            <AuditoriaBackgroundPicker />
          </div>
        ) : null}
      </header>

      {children}
    </div>
  );
}
