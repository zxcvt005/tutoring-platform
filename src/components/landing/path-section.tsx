import { LandingSection } from "@/components/landing/landing-section";
import { landingPath } from "@/lib/landing/content";

export function PathSection() {
  return (
    <LandingSection
      id="path"
      eyebrow="Путь ученика"
      title="Как устроена подготовка"
      description="Шесть шагов от знакомства до понятного контроля. Это рабочая последовательность — не обещание чуда за неделю."
    >
      <ol className="relative flex flex-col gap-0">
        {landingPath.map((step, index) => (
          <li
            key={step.id}
            className="grid gap-3 border-t border-border py-8 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-8"
          >
            <p className="font-display text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Этап {String(index + 1).padStart(2, "0")}
            </p>
            <div className="min-w-0 max-w-2xl">
              <h3 className="font-display text-2xl font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </LandingSection>
  );
}
