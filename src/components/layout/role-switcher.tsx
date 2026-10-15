"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function RoleSwitcher() {
  const pathname = usePathname();
  const isDirekciya = pathname.startsWith("/direkciya");
  const isKafedra = pathname.startsWith("/kafedra");

  return (
    <div className="inline-flex w-full rounded-full border border-border/90 bg-background p-1 text-sm">
      <Link
        href="/direkciya"
        className={cn(
          "flex-1 rounded-full px-2.5 py-1.5 text-center transition-colors",
          isDirekciya
            ? "bg-primary text-primary-foreground shadow-none"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Дирекция
      </Link>
      <Link
        href="/kafedra"
        className={cn(
          "flex-1 rounded-full px-2.5 py-1.5 text-center transition-colors",
          isKafedra
            ? "bg-primary text-primary-foreground shadow-none"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Кафедра
      </Link>
    </div>
  );
}
