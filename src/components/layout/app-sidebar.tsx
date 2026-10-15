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
import { Separator } from "@/components/ui/separator";
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
    <nav className="flex flex-col gap-0.5">
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
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            )}
          >
            <Icon className="size-4 shrink-0 opacity-70" />
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

  return (
    <div className="flex h-full flex-col gap-4 p-4" onClick={onNavigate}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Кабинет
          </p>
          <p className="text-lg font-semibold text-sidebar-foreground">{title}</p>
        </div>
        <RoleSwitcher />
      </div>

      <Separator />

      <NavLinks items={items} />

      {role === "kafedra" ? (
        <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs text-muted-foreground">Demo-преподаватель</p>
          <Select
            value={data.currentTeacherId || null}
            onValueChange={(v) => {
              if (v) setCurrentTeacherId(v);
            }}
          >
            <SelectTrigger className="w-full">
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
        <Separator />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={resetDemo}
        >
          Сбросить демо
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Данные только в этом браузере (localStorage).
        </p>
      </div>
    </div>
  );
}
