import { LandingSection } from "@/components/landing/landing-section";
import { landingEnvironment } from "@/lib/landing/content";

export function EnvironmentSection() {
  return (
    <LandingSection
      id="environment"
      eyebrow="Среда"
      title="Учёба, которую не хочется бросить"
      description={landingEnvironment.lead}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {landingEnvironment.pieces.map((piece, index) => (
          <article
            key={piece.id}
            className={
              index === 0 ? "panel-soft surface-sky px-6 py-8" : "panel px-6 py-8"
            }
          >
            <h3 className="font-display text-2xl leading-snug font-semibold tracking-tight">
              {piece.title}
            </h3>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {piece.text}
            </p>
          </article>
        ))}
      </div>
    </LandingSection>
  );
}
