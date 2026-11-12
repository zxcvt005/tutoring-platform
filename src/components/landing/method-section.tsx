import { LandingNextStep } from "@/components/landing/landing-next-step";
import { LandingSection } from "@/components/landing/landing-section";
import { landingMethod } from "@/lib/landing/content";
import { landingSurfacePadClass } from "@/lib/landing/ui";
import { cn } from "@/lib/utils";

export function MethodSection() {
  return (
    <LandingSection
      id="method"
      eyebrow="Метод"
      title="Почему ученик начинает понимать физику"
      description={landingMethod.intro}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <article className={cn(landingSurfacePadClass, "surface-sand")}>
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            {landingMethod.contrast.watched.title}
          </h3>
          <p className="mt-3 text-base leading-relaxed text-foreground/70">
            {landingMethod.contrast.watched.text}
          </p>
        </article>
        <article className={landingSurfacePadClass}>
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            {landingMethod.contrast.owned.title}
          </h3>
          <p className="mt-3 text-base leading-relaxed text-foreground/70">
            {landingMethod.contrast.owned.text}
          </p>
        </article>
      </div>

      <article
        className={cn(
          landingSurfacePadClass,
          "mt-4 bg-pastel-blue/45 sm:p-8"
        )}
      >
        <h3 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {landingMethod.format.title}
        </h3>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/70">
          {landingMethod.format.lead}
        </p>
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {landingMethod.format.bullets.map((bullet) => (
            <li
              key={bullet}
              className="text-base leading-relaxed text-foreground"
            >
              {bullet}
            </li>
          ))}
        </ul>
      </article>

      <ol className="mt-4 grid gap-4">
        {landingMethod.points.map((point) => (
          <li key={point.id} className={landingSurfacePadClass}>
            <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              {point.title}
            </h3>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/70">
              {point.description}
            </p>
          </li>
        ))}
      </ol>
      <LandingNextStep
        title="Посмотреть систему можно на диагностике"
        text="Пробный урок показывает, как преподаватель ведёт рассуждение. Форма внизу ничего не оплачивает."
      />
    </LandingSection>
  );
}
