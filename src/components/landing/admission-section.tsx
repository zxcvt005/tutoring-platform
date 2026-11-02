import { LandingSection } from "@/components/landing/landing-section";
import { landingAdmission } from "@/lib/landing/content";

export function AdmissionSection() {
  return (
    <LandingSection
      id="admission"
      eyebrow="После экзамена"
      title="Балл — ещё не поступление"
      description={landingAdmission.lead}
    >
      <ol className="grid gap-4 sm:grid-cols-2">
        {landingAdmission.points.map((point, index) => (
          <li key={point} className="border-t border-border pt-4">
            <p className="font-display text-sm font-semibold text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-2 text-base leading-relaxed">{point}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {landingAdmission.condition}
      </p>
    </LandingSection>
  );
}
