import { ApplyButton } from "@/components/landing/apply-button";
import { LandingSection } from "@/components/landing/landing-section";
import { formatRub, landingTariffs } from "@/lib/landing/content";

export function PricingSection() {
  return (
    <LandingSection
      id="pricing"
      eyebrow="Форматы"
      title="Три объёма одной системы"
      description="Отличается число часов с преподавателем. Куратор и пробный экзамен раз в месяц есть в каждом формате. Кнопка открывает заявку, а не оплату."
    >
      <ul className="grid gap-4 lg:grid-cols-3">
        {landingTariffs.map((tariff) => (
          <li key={tariff.id} className="panel flex min-w-0 flex-col gap-5 p-6">
            <div>
              <h3 className="font-display text-2xl font-semibold tracking-tight">
                {tariff.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {tariff.audience}
              </p>
            </div>
            <p className="font-display text-4xl font-semibold tracking-tight">
              {formatRub(tariff.price)}
              <span className="ml-2 text-base font-medium text-muted-foreground">
                в месяц
              </span>
            </p>
            <ul className="flex flex-col gap-2 text-sm leading-relaxed">
              {tariff.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="mt-auto pt-2">
              <ApplyButton
                tariffId={tariff.id}
                variant="outline"
                className="w-full"
              >
                Оставить заявку
              </ApplyButton>
            </div>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
