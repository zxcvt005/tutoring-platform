import Link from "next/link";

import { BrandMark } from "@/components/landing/brand-mark";
import { LandingContainer } from "@/components/landing/landing-section";
import { landingNav } from "@/lib/landing/content";

export function LandingFooter() {
  return (
    <footer className="border-t border-border/80 py-12">
      <LandingContainer>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <BrandMark />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Онлайн-школа подготовки к ЕГЭ по физике. Системная работа в
              кабинете, а не набор разрозненных уроков.
            </p>
          </div>
          <nav className="flex min-w-0 flex-col gap-2" aria-label="Навигация в подвале">
            {landingNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="w-fit text-sm text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#guarantees"
              className="w-fit text-sm text-muted-foreground hover:text-foreground"
            >
              Гарантии
            </a>
            <a
              href="#apply"
              className="w-fit text-sm text-muted-foreground hover:text-foreground"
            >
              Диагностика
            </a>
          </nav>
          <div className="flex min-w-0 flex-col gap-2">
            <Link
              href="/login"
              className="w-fit text-sm text-muted-foreground hover:text-foreground"
            >
              Личный кабинет
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Публичные контакты, адрес и юридические документы появятся здесь,
              когда будут согласованы. Политика конфиденциальности пока не
              опубликована.
            </p>
          </div>
        </div>
      </LandingContainer>
    </footer>
  );
}
