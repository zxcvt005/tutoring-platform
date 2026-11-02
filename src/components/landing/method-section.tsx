import { LandingNextStep } from "@/components/landing/landing-next-step";
import { LandingSection } from "@/components/landing/landing-section";
import { landingMethod } from "@/lib/landing/content";

export function MethodSection() {
  return (
    <LandingSection
      id="method"
      eyebrow="Метод"
      title="Почему ученик начинает понимать физику"
      description={landingMethod.intro}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <article className="panel-soft surface-sand px-6 py-6">
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            {landingMethod.contrast.watched.title}
          </h3>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {landingMethod.contrast.watched.text}
          </p>
        </article>
        <article className="panel px-6 py-6">
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            {landingMethod.contrast.owned.title}
          </h3>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {landingMethod.contrast.owned.text}
          </p>
        </article>
      </div>
      <ol className="mt-12 flex flex-col">
        {landingMethod.points.map((point) => (
          <li key={point.id} className="border-t border-border py-7">
            <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              {point.title}
            </h3>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
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
