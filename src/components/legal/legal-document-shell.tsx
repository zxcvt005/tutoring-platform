import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/landing/brand-mark";
import { LandingBackgroundLayer } from "@/components/landing/landing-background";
import { LandingFooter } from "@/components/landing/landing-footer";
import {
  LandingContainer,
  landingContainerClass,
} from "@/components/landing/landing-section";
import type { LegalDocumentMeta } from "@/lib/legal/documents";
import { landingSurfacePadClass } from "@/lib/landing/ui";
import { cn } from "@/lib/utils";

export function LegalDocumentShell({
  meta,
  children,
  toc,
}: {
  meta: LegalDocumentMeta;
  children: ReactNode;
  toc?: { id: string; label: string }[];
}) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-background text-foreground">
      <LandingBackgroundLayer />
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
        <div
          className={cn(
            landingContainerClass,
            "flex h-14 items-center justify-between gap-3 rounded-3xl border border-white/45 bg-white/55 px-3 backdrop-blur-md sm:h-16 sm:px-4"
          )}
        >
          <Link href="/" className="shrink-0" aria-label="Неодин — на главную">
            <BrandMark />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Навигация">
            <Link
              href="/"
              className="rounded-xl px-2.5 py-1.5 text-sm text-foreground/70 hover:bg-pastel-blue/70 hover:text-foreground"
            >
              На главную
            </Link>
            <Link
              href="/login"
              className="rounded-xl px-2.5 py-1.5 text-sm text-foreground/70 hover:bg-pastel-blue/70 hover:text-foreground"
            >
              Личный кабинет
            </Link>
          </nav>
        </div>
      </header>

      <main className="px-3 py-8 sm:px-4 sm:py-12">
        <LandingContainer
          className={cn(landingSurfacePadClass, "max-w-3xl py-8 sm:px-8 sm:py-10")}
        >
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Правовая информация
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {meta.title}
          </h1>
          {meta.available && meta.publishedAt ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Редакция от {meta.publishedAt} · версия {meta.version}
            </p>
          ) : null}
          {meta.pdfPath ? (
            <p className="mt-3 text-sm">
              <a
                href={meta.pdfPath}
                className="font-medium underline-offset-4 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть исходный PDF
              </a>
            </p>
          ) : null}

          {toc && toc.length > 2 ? (
            <nav
              className="mt-6 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
              aria-label="Оглавление"
            >
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Содержание
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-foreground/80 underline-offset-2 hover:underline"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          <div className="legal-prose mt-8 space-y-5 text-[0.95rem] leading-relaxed text-foreground/90">
            {children}
          </div>
        </LandingContainer>
      </main>
      <LandingFooter />
    </div>
  );
}
