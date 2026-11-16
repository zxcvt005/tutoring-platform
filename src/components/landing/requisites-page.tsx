import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/landing/brand-mark";
import { LandingBackgroundLayer } from "@/components/landing/landing-background";
import { LandingFooter } from "@/components/landing/landing-footer";
import {
  LandingContainer,
  landingContainerClass,
} from "@/components/landing/landing-section";
import { landingRequisites } from "@/lib/landing/requisites";
import { landingSurfacePadClass } from "@/lib/landing/ui";
import { cn } from "@/lib/utils";

function RequisitesHeader() {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div
        className={cn(
          landingContainerClass,
          "flex h-14 items-center justify-between gap-3 rounded-3xl border border-white/45 bg-white/55 px-3 shadow-none backdrop-blur-md sm:h-16 sm:px-4"
        )}
      >
        <Link href="/" className="shrink-0" aria-label="Неодин — на главную">
          <BrandMark />
        </Link>
        <nav
          className="flex min-w-0 items-center gap-1 sm:gap-2"
          aria-label="Навигация страницы реквизитов"
        >
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
  );
}

function RequisiteRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-t border-black/10 py-4 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6 sm:py-5">
      <dt className="text-xs font-semibold tracking-[0.14em] text-foreground/55 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 text-base leading-relaxed break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}

export function RequisitesPage() {
  const r = landingRequisites;

  return (
    <div data-landing className="relative flex min-h-full flex-1 flex-col">
      <LandingBackgroundLayer />
      <div className="relative z-10 flex min-h-full flex-1 flex-col">
        <RequisitesHeader />
        <main className="flex-1 overflow-x-clip pb-10 sm:pb-14">
          <LandingContainer className="pt-10 sm:pt-14">
            <header className="mb-6 max-w-3xl sm:mb-8">
              <p className="text-xs font-semibold tracking-[0.16em] text-foreground/55 uppercase">
                Документы
              </p>
              <h1 className="font-display mt-2 text-3xl leading-[1.15] font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                Реквизиты
              </h1>
            </header>

            <article
              className={cn(landingSurfacePadClass, "bg-pastel-blue/35 sm:p-8")}
              aria-labelledby="requisites-legal-name"
            >
              <h2
                id="requisites-legal-name"
                className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                {r.legalName}
              </h2>

              <dl className="mt-6 sm:mt-8">
                <RequisiteRow label="ИНН">{r.inn}</RequisiteRow>
                <RequisiteRow label="ОГРНИП">{r.ogrnip}</RequisiteRow>
                <RequisiteRow label="Адрес">{r.address}</RequisiteRow>
                <RequisiteRow label="Телефон">
                  <a
                    href={`tel:${r.phoneTel}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.phoneDisplay}
                  </a>
                </RequisiteRow>
                <RequisiteRow label="Telegram">
                  <a
                    href={r.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:underline"
                  >
                    {r.telegramHandle}
                  </a>
                </RequisiteRow>
                <RequisiteRow label="E-mail">
                  <a
                    href={`mailto:${r.email}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.email}
                  </a>
                </RequisiteRow>
              </dl>
            </article>
          </LandingContainer>
        </main>
        <LandingFooter />
      </div>
    </div>
  );
}
