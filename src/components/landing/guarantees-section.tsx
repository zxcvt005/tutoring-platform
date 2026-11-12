import { LandingNextStep } from "@/components/landing/landing-next-step";
import { LandingSection } from "@/components/landing/landing-section";
import { landingGuarantees } from "@/lib/landing/content";
import { landingSurfacePadClass } from "@/lib/landing/ui";
import { cn } from "@/lib/utils";

export function GuaranteesSection() {
  return (
    <LandingSection
      id="guarantees"
      eyebrow="Гарантии"
      title="Две понятные гарантии"
      description={landingGuarantees.footnote}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {landingGuarantees.items.map((item) => (
          <article
            key={item.id}
            className={cn(landingSurfacePadClass, "bg-pastel-blue/55")}
          >
            <h3 className="font-display text-2xl font-semibold tracking-tight">
              {item.title}
            </h3>
            <p className="mt-3 text-base leading-relaxed text-foreground/70">
              {item.text}
            </p>
          </article>
        ))}
      </div>
      <LandingNextStep
        title="Диагностика ни к чему не обязывает"
        text="Заявка не списывает оплату. Сначала смотрим уровень и формат — решение об обучении потом."
      />
    </LandingSection>
  );
}
