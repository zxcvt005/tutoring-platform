import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const landingContainerClass =
  "mx-auto w-full max-w-6xl px-4 sm:px-6";

export function LandingContainer({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(landingContainerClass, className)}>{children}</div>
  );
}

export function LandingSection({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
  contentClassName,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-28 py-14 sm:py-20", className)}>
      <LandingContainer className={contentClassName}>
        {title || eyebrow || description ? (
          <header className="mb-6 max-w-3xl sm:mb-8">
            {eyebrow ? (
              <p className="text-xs font-semibold tracking-[0.16em] text-foreground/55 uppercase">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="font-display mt-2 text-3xl leading-[1.15] font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/70">
                {description}
              </p>
            ) : null}
          </header>
        ) : null}
        {children}
      </LandingContainer>
    </section>
  );
}
