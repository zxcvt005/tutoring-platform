"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Users,
  UsersRound,
} from "lucide-react";

import { RoleSwitcher } from "@/components/layout/role-switcher";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const direkciyaNav: NavItem[] = [
  { href: "/direkciya", label: "Обзор", icon: LayoutDashboard },
  { href: "/direkciya/students", label: "Ученики", icon: GraduationCap },
  { href: "/direkciya/teachers", label: "Преподаватели", icon: Users },
  { href: "/direkciya/groups", label: "Группы", icon: UsersRound },
  { href: "/direkciya/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/direkciya/assignments", label: "Задания", icon: BookOpen },
  { href: "/direkciya/results", label: "Результаты", icon: ClipboardList },
];

const kafedraNav: NavItem[] = [
  { href: "/kafedra", label: "Обзор", icon: LayoutDashboard },
  { href: "/kafedra/students", label: "Ученики", icon: GraduationCap },
  { href: "/kafedra/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/kafedra/assignments", label: "Задания", icon: BookOpen },
  { href: "/kafedra/results", label: "Результаты", icon: ClipboardList },
];

function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === "/direkciya" || item.href === "/kafedra"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
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
            {item.label}
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
  role: "direkciya" | "kafedra";
  onNavigate?: () => void;
}) {
  const { data, setCurrentTeacherId, resetDemo } = useDemoStore();
  const items = role === "direkciya" ? direkciyaNav : kafedraNav;
  const title = role === "direkciya" ? "Дирекция" : "Кафедра";
  const accentClass = role === "direkciya" ? "surface-sky" : "surface-sand";

  return (
    <div className="flex h-full flex-col gap-5 p-4" onClick={onNavigate}>
      <div className="space-y-3">
        <div className={cn("panel-soft px-3 py-3", accentClass)}>
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Кабинет
          </p>
          <p className="font-display text-xl leading-tight font-semibold tracking-tight text-sidebar-foreground">
            {title}
          </p>
        </div>
        <RoleSwitcher />
      </div>

      <NavLinks items={items} />

      {role === "kafedra" ? (
        <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <p className="px-0.5 text-xs font-medium text-muted-foreground">
            Demo-преподаватель
          </p>
          <Select
            value={data.currentTeacherId || null}
            onValueChange={(v) => {
              if (v) setCurrentTeacherId(v);
            }}
          >
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Выберите">
                {(v: string | null) =>
                  data.teachers.find((t) => t.id === v)?.fullName ?? "Выберите"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {data.teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="mt-auto space-y-2 pt-2" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full rounded-xl"
          onClick={resetDemo}
        >
          Сбросить демо
        </Button>
        <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
          Данные только в этом браузере (localStorage).
        </p>
      </div>
    </div>
  );
}
