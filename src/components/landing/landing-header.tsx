"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";

import { ApplyButton } from "@/components/landing/apply-button";
import { BrandMark } from "@/components/landing/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { landingContainerClass } from "@/components/landing/landing-section";
import { landingNav } from "@/lib/landing/content";
import { cn } from "@/lib/utils";

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className={cn(landingContainerClass, "flex h-16 items-center gap-3")}>
        <Link href="/" className="shrink-0" aria-label="Неодин — на главную">
          <BrandMark />
        </Link>

        <nav
          className="mx-auto hidden min-w-0 items-center gap-1 lg:flex"
          aria-label="Разделы страницы"
        >
          {landingNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button
            nativeButton={false}
            variant="ghost"
            className="hidden h-10 rounded-xl px-3 sm:inline-flex"
            render={<Link href="/login" />}
          >
            Личный кабинет
          </Button>
          <ApplyButton className="max-sm:px-3">Диагностика</ApplyButton>

          <Sheet open={open} onOpenChange={setOpen}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl lg:hidden"
              aria-label="Открыть меню"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </Button>
            <SheetContent side="right" className="w-[min(20rem,100%)]">
              <SheetHeader>
                <SheetTitle>
                  <BrandMark size="sm" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label="Мобильное меню">
                {landingNav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-lg px-2 py-2.5 text-sm text-foreground hover:bg-muted"
                    )}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
                <Link
                  href="/login"
                  className="rounded-lg px-2 py-2.5 text-sm text-foreground hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  Личный кабинет
                </Link>
              </nav>
              <div className="px-4 pt-2">
                <ApplyButton
                  className="w-full"
                  onBeforeApply={() => setOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
