"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
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
import {
  scrollToLandingSection,
  useLandingActiveSection,
} from "@/lib/landing/use-active-section";
import { cn } from "@/lib/utils";

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const observedId = useLandingActiveSection();
  const activeId = pendingId ?? observedId;

  function onNavClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    event.preventDefault();
    const id = href.replace(/^#/, "");
    setPendingId(id);
    setOpen(false);
    scrollToLandingSection(href);
    window.setTimeout(() => setPendingId(null), 700);
  }

  return (
    <header
      data-landing-header
      className="sticky top-0 z-40 px-3 pt-3 sm:px-4"
    >
      <div
        className={cn(
          landingContainerClass,
          "flex h-14 items-center gap-3 rounded-3xl border border-white/45 bg-white/55 px-3 shadow-none backdrop-blur-md sm:h-16 sm:px-4"
        )}
      >
        <Link href="/" className="shrink-0" aria-label="Неодин — на главную">
          <BrandMark />
        </Link>

        <nav
          className="mx-auto hidden min-w-0 items-center gap-1 lg:flex"
          aria-label="Разделы страницы"
        >
          {landingNav.map((item) => {
            const id = item.href.replace(/^#/, "");
            const active = activeId === id;
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-xl px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-pastel-blue font-medium text-foreground"
                    : "text-foreground/70 hover:bg-pastel-blue/70 hover:text-foreground"
                )}
                onClick={(event) => onNavClick(event, item.href)}
              >
                {item.label}
              </a>
            );
          })}
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
              className="rounded-xl border-black/10 bg-white/50 backdrop-blur-md lg:hidden"
              aria-label="Открыть меню"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </Button>
            <SheetContent
              side="right"
              className="inset-y-3 right-3 h-auto max-h-[calc(100dvh-1.5rem)] w-[min(20rem,calc(100%-1.5rem))] overflow-y-auto rounded-3xl border border-white/45 bg-white/70 p-0 shadow-none backdrop-blur-md"
            >
              <SheetHeader className="px-4 pt-4">
                <SheetTitle>
                  <BrandMark size="sm" />
                </SheetTitle>
              </SheetHeader>
              <nav
                className="flex flex-col gap-1 px-4 pb-2"
                aria-label="Мобильное меню"
              >
                {landingNav.map((item) => {
                  const id = item.href.replace(/^#/, "");
                  const active = activeId === id;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "rounded-xl px-2 py-2.5 text-sm",
                        active
                          ? "bg-pastel-blue font-medium text-foreground"
                          : "text-foreground hover:bg-pastel-blue/70"
                      )}
                      onClick={(event) => onNavClick(event, item.href)}
                    >
                      {item.label}
                    </a>
                  );
                })}
                <Link
                  href="/login"
                  className="rounded-xl px-2 py-2.5 text-sm text-foreground hover:bg-pastel-blue/70"
                  onClick={() => setOpen(false)}
                >
                  Личный кабинет
                </Link>
              </nav>
              <div className="px-4 pt-2 pb-4">
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
