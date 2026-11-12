import { LandingSection } from "@/components/landing/landing-section";
import { landingEnvironment } from "@/lib/landing/content";
import { landingSurfacePadClass } from "@/lib/landing/ui";
import { cn } from "@/lib/utils";

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
            className={cn(
              landingSurfacePadClass,
              index === 0 && "bg-pastel-blue/55"
            )}
          >
            <h3 className="font-display text-2xl leading-snug font-semibold tracking-tight">
              {piece.title}
            </h3>
            <p className="mt-4 text-base leading-relaxed text-foreground/70">
              {piece.text}
            </p>
          </article>
        ))}
      </div>
    </LandingSection>
  );
}
