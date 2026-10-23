"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileQuestion,
  GraduationCap,
  History,
  LayoutDashboard,
  Package,
  PlayCircle,
  UserRound,
  Users,
  BookMarked,
} from "lucide-react";

import type { CabinetRole } from "@/components/layout/cabinet-shell";
import { DevAccountSwitcher } from "@/components/layout/dev-account-switcher";
import { RoleSwitcher } from "@/components/layout/role-switcher";
import { Button } from "@/components/ui/button";
import {
  auditoriaNavItems,
  direkciyaNavItems,
  kafedraNavItems,
} from "@/lib/cabinet-nav";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const iconsByHref: Record<string, NavItem["icon"]> = {
  "/direkciya": LayoutDashboard,
  "/direkciya/students": GraduationCap,
  "/direkciya/teachers": Users,
  "/direkciya/tariffs": Package,
  "/direkciya/payments": CreditCard,
  "/direkciya/users": UserRound,
  "/direkciya/schedule": CalendarDays,
  "/direkciya/results": ClipboardList,
  "/kafedra": LayoutDashboard,
  "/kafedra/students": GraduationCap,
  "/kafedra/schedule": CalendarDays,
  "/kafedra/topics": BookMarked,
  "/kafedra/theory": PlayCircle,
  "/kafedra/tests": FileQuestion,
  "/kafedra/grades": ClipboardList,
  "/kafedra/profile": UserRound,
  "/auditoria": LayoutDashboard,
  "/auditoria/homework": BookOpen,
  "/auditoria/theory": PlayCircle,
  "/auditoria/history": History,
  "/auditoria/profile": UserRound,
};

function withIcons(
  items: { href: string; label: string }[]
): NavItem[] {
  return items.map((item) => ({
    ...item,
    icon: iconsByHref[item.href] ?? LayoutDashboard,
  }));
}

const direkciyaNav = withIcons(direkciyaNavItems);
const kafedraNav = withIcons(kafedraNavItems);
const auditoriaNav = withIcons(auditoriaNavItems);

const titles: Record<CabinetRole, string> = {
  direkciya: "Дирекция",
  kafedra: "Кафедра",
  auditoria: "Аудитория",
};

const accentClass: Record<CabinetRole, string> = {
  direkciya: "surface-sky",
  kafedra: "surface-sand",
  auditoria: "surface-mint",
};

function NavLinks({
  items,
  role,
  alertHrefs,
}: {
  items: NavItem[];
  role: CabinetRole;
  /** Маршруты с красным индикатором (напр. ученики без преподавателя) */
  alertHrefs?: Set<string>;
}) {
  const pathname = usePathname();
  const homeHref =
    role === "direkciya"
      ? "/direkciya"
      : role === "kafedra"
        ? "/kafedra"
        : "/auditoria";

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === homeHref
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const showAlert = alertHrefs?.has(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[0.9rem] transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            )}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
              />
            ) : null}
            <Icon
              className={cn(
                "size-[1.05rem] shrink-0",
                active ? "opacity-90" : "opacity-55"
              )}
            />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {item.label}
              {showAlert ? (
                <span
                  className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[0.55rem] font-bold text-white"
                  title="Есть ученики без преподавателя"
                  aria-label="Есть ученики без преподавателя"
                >
                  !
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar({
  role,
  onNavigate,
}: {
  role: CabinetRole;
  onNavigate?: () => void;
}) {
  const { data, auth, demoLoginEnabled, resetDemo, logout } = useDemoStore();
  const items =
    role === "direkciya"
      ? direkciyaNav
      : role === "kafedra"
        ? kafedraNav
        : auditoriaNav;
  const title = titles[role];

  const unassignedActiveCount =
    role === "direkciya"
      ? data.students.filter((s) => !s.teacherId && s.status === "active").length
      : 0;
  const alertHrefs =
    unassignedActiveCount > 0
      ? new Set(["/direkciya/students"])
      : undefined;

  return (
    <div className="flex h-full flex-col gap-5 p-4" onClick={onNavigate}>
      <div className="space-y-3">
        <div className={cn("panel-soft px-3 py-3", accentClass[role])}>
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Кабинет
          </p>
          <p className="font-display text-xl leading-tight font-semibold tracking-tight text-sidebar-foreground">
            {title}
          </p>
          {auth?.fullName ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {auth.fullName}
            </p>
          ) : null}
        </div>
        {demoLoginEnabled ? <RoleSwitcher /> : null}
      </div>

      <NavLinks items={items} role={role} alertHrefs={alertHrefs} />

      {demoLoginEnabled ? <DevAccountSwitcher auth={auth} /> : null}

      <div className="mt-auto space-y-2 pt-2" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full rounded-xl"
          onClick={() => void logout()}
        >
          Выйти
        </Button>
        {demoLoginEnabled ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full rounded-xl"
              onClick={resetDemo}
            >
              Как обновить данные
            </Button>
            <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
              Локальный режим. Данные в PostgreSQL.
            </p>
          </>
        ) : (
          <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
            Сессия на сервере. Данные в PostgreSQL.
          </p>
        )}
      </div>
    </div>
  );
}
