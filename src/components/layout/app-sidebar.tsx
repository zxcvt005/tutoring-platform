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
  MessageSquare,
  Package,
  PlayCircle,
  Presentation,
  Star,
  UserRound,
  Users,
  BookMarked,
  Video,
  Wallet,
} from "lucide-react";

import type { CabinetRole } from "@/components/layout/cabinet-shell";
import { BrandMark } from "@/components/landing/brand-mark";
import { Button } from "@/components/ui/button";
import {
  assistentNavItems,
  auditoriaNavItems,
  direkciyaNavItems,
  kafedraNavItems,
  pressaNavItems,
} from "@/lib/cabinet-nav";
import { showSidebarCabinetChrome } from "@/lib/cabinet-shell-classes";
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
  "/direkciya/salaries": Wallet,
  "/direkciya/knowledge": BookOpen,
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

function NavLinks({
  items,
  role,
  alertHrefs,
  navBasePath,
}: {
  items: NavItem[];
  role: CabinetRole;
  /** Маршруты с красным индикатором (напр. ученики без преподавателя) */
  alertHrefs?: Set<string>;
  /** Для публичного демо Аудитории: `/demo/student` вместо `/auditoria`. */
  navBasePath?: string;
}) {
  const pathname = usePathname();
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
    <nav className={cn("flex flex-col", auditoria ? "gap-2" : "gap-1")}>
      {items.map((item) => {
        const href = withNavBase(item.href, navBasePath);
        const active =
          href === homeHref
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        const Icon = item.icon;
        const showAlert = alertHrefs?.has(item.href);
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[0.9rem] transition-colors",
              auditoria && "py-2.5",
              active
                ? auditoria
                  ? "bg-pastel-blue font-medium text-foreground"
                  : "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : auditoria
                  ? "text-foreground/70 hover:bg-pastel-blue/70 hover:text-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            )}
          >
            {active && !auditoria ? (
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
  navBasePath,
  logoutLabel = "Выйти",
}: {
  role: CabinetRole;
  onNavigate?: () => void;
  navBasePath?: string;
  logoutLabel?: string;
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
      ? data.students.filter((s) => !s.teacherId && s.status === "active").length
      : 0;
  const alertHrefs =
    unassignedActiveCount > 0
      ? new Set(["/direkciya/students"])
      : undefined;

  return (
    <div
      className={cn(
        "flex h-full flex-col p-4",
        showChrome ? "gap-5" : "gap-3"
      )}
      onClick={onNavigate}
    >
      {showChrome ? (
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
      ) : (
        <BrandMark className="px-1 pt-1 pb-2 text-[1.65rem] leading-none" />
      )}

      <NavLinks
        items={items}
        role={role}
        alertHrefs={alertHrefs}
        navBasePath={navBasePath}
      />

      <div className="mt-auto space-y-2 pt-2" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full rounded-xl"
          onClick={() => void logout()}
        >
          {logoutLabel}
        </Button>
      </div>
    </div>
  );
}
