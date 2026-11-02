import { LandingNextStep } from "@/components/landing/landing-next-step";
import { LandingSection } from "@/components/landing/landing-section";
import { landingGuarantees } from "@/lib/landing/content";

export function GuaranteesSection() {
  return (
    <LandingSection
      id="guarantees"
      eyebrow="Риск"
      title="Две гарантии, которые ещё нужно утвердить"
      description="Их нельзя прятать мелким шрифтом. И нельзя публиковать как уже работающую оферту, пока правила не согласованы."
    >
      <p className="panel mb-6 px-5 py-5 text-base leading-relaxed text-foreground sm:px-6">
        {landingGuarantees.notice}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {landingGuarantees.items.map((item) => (
          <article key={item.id} className="panel-soft surface-sky px-6 py-7">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Черновик правила
            </p>
            <h3 className="font-display mt-3 text-2xl font-semibold tracking-tight">
              {item.title}
            </h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {item.text}
            </p>
          </article>
        ))}
      </div>
      <LandingNextStep
        title="Диагностика ни к чему не обязывает"
        text="Заявка не списывает оплату. Гарантии начнут действовать только после того, как школа утвердит правила."
      />
    </LandingSection>
  );
}
