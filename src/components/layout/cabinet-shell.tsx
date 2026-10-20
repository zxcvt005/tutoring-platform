"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDemoStore } from "@/lib/store/demo-store";

export type CabinetRole = "direkciya" | "kafedra" | "auditoria";

const titles: Record<CabinetRole, string> = {
  direkciya: "Дирекция",
  kafedra: "Кафедра",
  auditoria: "Аудитория",
};

export function CabinetShell({
  role,
  children,
}: {
  role: CabinetRole;
  children: React.ReactNode;
}) {
  const { ready } = useDemoStore();
  const [open, setOpen] = useState(false);
  const title = titles[role];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <ImpersonationBanner />
      <div className="flex min-h-0 flex-1">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 border-r border-sidebar-border bg-sidebar lg:w-[15rem] md:block">
        <AppSidebar role={role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border/80 px-4 py-3 md:hidden">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => setOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu />
          </Button>
          <span className="font-display text-base font-semibold tracking-tight">
            {title}
          </span>
        </header>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Меню {title}</SheetTitle>
            </SheetHeader>
            <AppSidebar role={role} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          {!ready ? (
            <p className="text-sm text-muted-foreground">Загрузка данных с сервера…</p>
          ) : (
            <div className="mx-auto w-full max-w-[92rem]">{children}</div>
          )}
        </main>
      </div>
      </div>
    </div>
  );
}
