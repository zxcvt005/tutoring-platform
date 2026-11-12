"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Boxes,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileQuestion,
  GraduationCap,
  History,
  ListChecks,
  Bell,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  PlayCircle,
  Presentation,
  BarChart3,
  CalendarClock,
  Receipt,
  Star,
  Table2,
  UserRound,
  Users,
  BookMarked,
  Video,
  Wallet,
} from "lucide-react";

import type { CabinetRole } from "@/components/layout/cabinet-shell";
import { BrandMark } from "@/components/landing/brand-mark";
import { Button } from "@/components/ui/button";
import { HintTooltip } from "@/components/ui/tooltip";
import {
  assistentNavItems,
  auditoriaNavItems,
  direkciyaNavItems,
  kafedraNavItems,
  pressaNavItems,
} from "@/lib/cabinet-nav";
import { showSidebarCabinetChrome } from "@/lib/cabinet-shell-classes";
import { countUnassignedActiveStudents } from "@/lib/students/unassigned";
import { useDemoStore } from "@/lib/store/demo-store";
import { useStudentTour, useStudentTourPathname } from "@/lib/student-tour/paths";
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
  "/direkciya/salaries": Wallet,
  "/direkciya/knowledge": BookOpen,
  "/direkciya/zayavki": MessageSquare,
  "/direkciya/baza": Table2,
  "/direkciya/probnye-uroki": CalendarClock,
  "/direkciya/rnp-avito": BarChart3,
  "/direkciya/rashody": Receipt,
  "/direkciya/tariffs": Package,
  "/direkciya/products": Boxes,
  "/direkciya/payments": CreditCard,
  "/direkciya/users": UserRound,
  "/direkciya/schedule": CalendarDays,
  "/direkciya/results": ClipboardList,
  "/kafedra": LayoutDashboard,
  "/kafedra/calls": Video,
  "/kafedra/students": GraduationCap,
  "/kafedra/schedule": CalendarDays,
  "/kafedra/topics": BookMarked,
  "/kafedra/theory": PlayCircle,
  "/kafedra/intensivy": Presentation,
  "/kafedra/tests": FileQuestion,
  "/kafedra/grades": ClipboardList,
  "/kafedra/probniki": ListChecks,
  "/kafedra/feedback": MessageSquare,
  "/kafedra/profile": UserRound,
  "/auditoria": LayoutDashboard,
  "/auditoria/calls": Video,
  "/auditoria/homework": BookOpen,
  "/auditoria/theory": PlayCircle,
  "/auditoria/intensivy": Presentation,
  "/auditoria/history": History,
  "/auditoria/pay": CreditCard,
  "/auditoria/profile": UserRound,
  "/pressa": LayoutDashboard,
  "/pressa/reminders": Bell,
  "/pressa/feedback": MessageSquare,
  "/pressa/ratings": Star,
  "/pressa/students": GraduationCap,
  "/pressa/teachers": Users,
  "/pressa/trials": CalendarDays,
  "/pressa/analytics": ClipboardList,
  "/assistent/knowledge": BookOpen,
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
const pressaNav = withIcons(pressaNavItems);
const assistentNav = withIcons(assistentNavItems);

const titles: Record<CabinetRole, string> = {
  direkciya: "Дирекция",
  kafedra: "Кафедра",
  auditoria: "Аудитория",
  pressa: "Пресса",
  assistent: "Ассистент",
};

const accentClass: Record<CabinetRole, string> = {
  direkciya: "surface-sky",
  kafedra: "surface-sand",
  auditoria: "surface-mint",
  pressa: "surface-sky",
  assistent: "surface-sky",
};

function withNavBase(href: string, navBasePath?: string): string {
  if (!navBasePath || !href.startsWith("/auditoria")) return href;
  return `${navBasePath}${href.slice("/auditoria".length)}` || navBasePath;
}

function tourNavKey(auditoriaHref: string): string {
  if (auditoriaHref === "/auditoria") return "home";
  return auditoriaHref.replace(/^\/auditoria\//, "").replace(/\//g, "-");
}

function NavLinks({
  items,
  role,
  alertHrefs,
  navBasePath,
  collapsed = false,
}: {
  items: NavItem[];
  role: CabinetRole;
  /** Маршруты с красным индикатором (напр. ученики без преподавателя) */
  alertHrefs?: Set<string>;
  /** Для публичного демо Аудитории: `/demo/student` вместо `/auditoria`. */
  navBasePath?: string;
  collapsed?: boolean;
}) {
  const nextPathname = usePathname();
  const tour = useStudentTour();
  const tourPathname = useStudentTourPathname();
  const pathname =
    tour.active && tour.mode === "embedded" ? tourPathname : nextPathname;
  const homeHref =
    role === "direkciya"
      ? "/direkciya"
      : role === "kafedra"
        ? "/kafedra"
        : role === "pressa"
          ? "/pressa"
          : role === "assistent"
            ? "/assistent/knowledge"
            : navBasePath || "/auditoria";

  const auditoria = role === "auditoria";

  return (
    <nav
      className={cn(
        "flex flex-col",
        auditoria ? "gap-2" : "gap-1",
        collapsed && "items-center"
      )}
    >
      {items.map((item) => {
        const href = withNavBase(item.href, navBasePath);
        const active =
          href === homeHref
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        const Icon = item.icon;
        const showAlert = alertHrefs?.has(item.href);
        const link = (
          <Link
            href={href}
            data-tour-nav={auditoria ? tourNavKey(item.href) : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[0.9rem] transition-colors",
              auditoria && "py-2.5",
              collapsed && "size-9 justify-center gap-0 p-0",
              active
                ? auditoria
                  ? "bg-pastel-blue font-medium text-foreground"
                  : "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : auditoria
                  ? "text-foreground/70 hover:bg-pastel-blue/70 hover:text-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            )}
          >
            {active && !auditoria && !collapsed ? (
              <span
                aria-hidden
                className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
              />
            ) : null}
            <span className="relative shrink-0">
              <Icon
                className={cn(
                  "size-[1.05rem] shrink-0",
                  active ? "opacity-90" : "opacity-55"
                )}
              />
              {showAlert && collapsed ? (
                <span
                  className="absolute -top-1 -right-1 size-2 rounded-full bg-red-500"
                  aria-label="Есть ученики без преподавателя"
                />
              ) : null}
            </span>
            {collapsed ? null : (
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
            )}
          </Link>
        );
        if (!collapsed) {
          return <div key={item.href}>{link}</div>;
        }
        return (
          <HintTooltip key={item.href} text={item.label}>
            {link}
          </HintTooltip>
        );
      })}
    </nav>
  );
}

export function AppSidebar({
  role,
  onNavigate,
  navBasePath,
  logoutLabel = "Выйти",
  collapsed = false,
}: {
  role: CabinetRole;
  onNavigate?: () => void;
  navBasePath?: string;
  logoutLabel?: string;
  collapsed?: boolean;
}) {
  const { data, auth, logout } = useDemoStore();
  const items =
    role === "direkciya"
      ? direkciyaNav
      : role === "kafedra"
        ? kafedraNav
        : role === "pressa"
          ? pressaNav
          : role === "assistent"
            ? assistentNav
            : auditoriaNav;
  const title = titles[role];
  const showChrome = showSidebarCabinetChrome(role);

  const unassignedActiveCount =
    role === "direkciya"
      ? countUnassignedActiveStudents(data.students)
      : 0;
  const alertHrefs =
    unassignedActiveCount > 0
      ? new Set(["/direkciya/students"])
      : undefined;

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        collapsed ? "items-center gap-3 p-2" : "p-4",
        !collapsed && (showChrome ? "gap-5" : "gap-3")
      )}
      onClick={onNavigate}
    >
      {showChrome ? (
        collapsed ? (
          <HintTooltip text={title}>
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-xl text-[0.7rem] font-semibold",
                accentClass[role]
              )}
              aria-label={title}
            >
              {title.slice(0, 1)}
            </div>
          </HintTooltip>
        ) : (
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
          </div>
        )
      ) : (
        <BrandMark className="px-1 pt-1 pb-2 text-[1.65rem] leading-none" />
      )}

      <NavLinks
        items={items}
        role={role}
        alertHrefs={alertHrefs}
        navBasePath={navBasePath}
        collapsed={collapsed}
      />

      <div
        className={cn(
          "mt-auto space-y-2 pt-2",
          collapsed && "flex w-full justify-center"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {collapsed ? (
          <HintTooltip text={logoutLabel}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="size-9 rounded-xl"
              aria-label={logoutLabel}
              onClick={() => void logout()}
            >
              <LogOut className="size-3.5" />
            </Button>
          </HintTooltip>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full rounded-xl"
            onClick={() => void logout()}
          >
            {logoutLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
