import { ApplyButton } from "@/components/landing/apply-button";
import { LandingSection } from "@/components/landing/landing-section";
import { landingProduct } from "@/lib/landing/content";

export function ProductSection() {
  return (
    <LandingSection
      id="product"
      eyebrow={landingProduct.eyebrow}
      title={landingProduct.title}
      description={landingProduct.lead}
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {landingProduct.points.map((point) => (
          <li key={point.id} className="panel px-5 py-6">
            <h3 className="font-display text-xl font-semibold tracking-tight">
              {point.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {point.text}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <ApplyButton>Записаться на диагностику</ApplyButton>
      </div>
    </LandingSection>
  );
}
