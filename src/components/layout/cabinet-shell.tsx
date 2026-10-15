"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDemoStore } from "@/lib/store/demo-store";

export function CabinetShell({
  role,
  children,
}: {
  role: "direkciya" | "kafedra";
  children: React.ReactNode;
}) {
  const { ready } = useDemoStore();
  const [open, setOpen] = useState(false);
  const title = role === "direkciya" ? "Дирекция" : "Кафедра";

  return (
    <div className="flex min-h-full flex-1 bg-background">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <AppSidebar role={role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => setOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu />
          </Button>
          <span className="font-medium">{title}</span>
        </header>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Меню {title}</SheetTitle>
            </SheetHeader>
            <AppSidebar role={role} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-5">
          {!ready ? (
            <p className="text-sm text-muted-foreground">Загрузка демо-данных…</p>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
