import Link from "next/link";

import { BrandMark } from "@/components/landing/brand-mark";
import { LandingContainer } from "@/components/landing/landing-section";
import { landingFooter, landingNav } from "@/lib/landing/content";
import { landingSurfacePadClass } from "@/lib/landing/ui";

export function LandingFooter() {
  return (
    <footer className="px-3 pb-3 sm:px-4 sm:pb-4">
      <LandingContainer
        className={`${landingSurfacePadClass} py-10 sm:px-6 sm:py-12`}
      >
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <BrandMark />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-foreground/70">
              {landingFooter.blurb}
            </p>
          </div>
          <nav
            className="flex min-w-0 flex-col gap-2"
            aria-label="Навигация в подвале"
          >
            {landingNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="w-fit text-sm text-foreground/70 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#guarantees"
              className="w-fit text-sm text-foreground/70 hover:text-foreground"
            >
              Гарантии
            </a>
            <a
              href="#apply"
              className="w-fit text-sm text-foreground/70 hover:text-foreground"
            >
              Диагностика
            </a>
          </nav>
          <div className="flex min-w-0 flex-col gap-2">
            <Link
              href="/login"
              className="w-fit text-sm text-foreground/70 hover:text-foreground"
            >
              Личный кабинет
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-foreground/70">
              {landingFooter.contactsPlaceholder}
            </p>
          </div>
        </div>
      </LandingContainer>
    </footer>
  );
}
