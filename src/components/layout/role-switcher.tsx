"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const roles = [
  { href: "/direkciya", label: "Дирекция", match: "/direkciya" },
  { href: "/kafedra", label: "Кафедра", match: "/kafedra" },
  { href: "/auditoria", label: "Аудитория", match: "/auditoria" },
] as const;

export function RoleSwitcher() {
  const pathname = usePathname();

  return (
    <div className="inline-flex w-full gap-0.5 rounded-xl border border-border/90 bg-background p-1 text-[0.8rem]">
      {roles.map((role) => {
        const active = pathname.startsWith(role.match);
        return (
          <Link
            key={role.href}
            href={role.href}
            className={cn(
              "flex-1 rounded-lg px-1.5 py-1.5 text-center leading-tight transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-none"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {role.label}
          </Link>
        );
      })}
    </div>
  );
}
