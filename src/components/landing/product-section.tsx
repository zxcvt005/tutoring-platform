import { ApplyButton } from "@/components/landing/apply-button";
import { LandingSection } from "@/components/landing/landing-section";
import { landingProduct } from "@/lib/landing/content";
import { landingSurfacePadClass } from "@/lib/landing/ui";

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
          <li key={point.id} className={landingSurfacePadClass}>
            <h3 className="font-display text-xl font-semibold tracking-tight">
              {point.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70 sm:text-base">
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
