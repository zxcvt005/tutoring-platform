import { LandingSection } from "@/components/landing/landing-section";
import { landingParents } from "@/lib/landing/content";

export function ParentsSection() {
  return (
    <LandingSection
      id="parents"
      eyebrow="Для родителей"
      title={landingParents.title}
      description={landingParents.lead}
    >
      <ul className="grid gap-8 md:grid-cols-2">
        {landingParents.points.map((point) => (
          <li key={point.id} className="min-w-0 border-t border-border pt-5">
            <h3 className="font-display text-2xl font-semibold tracking-tight">
              {point.title}
            </h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {point.text}
            </p>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
