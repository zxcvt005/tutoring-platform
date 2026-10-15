"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function RoleSwitcher() {
  const pathname = usePathname();
  const isDirekciya = pathname.startsWith("/direkciya");
  const isKafedra = pathname.startsWith("/kafedra");

  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
      <Link
        href="/direkciya"
        className={cn(
          "rounded-md px-2.5 py-1 transition-colors",
          isDirekciya
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Дирекция
      </Link>
      <Link
        href="/kafedra"
        className={cn(
          "rounded-md px-2.5 py-1 transition-colors",
          isKafedra
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Кафедра
      </Link>
    </div>
  );
}
