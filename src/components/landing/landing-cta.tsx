import { LandingSection } from "@/components/landing/landing-section";
import { LeadForm } from "@/components/landing/lead-form";
import { landingFinal } from "@/lib/landing/content";

export function LandingCta() {
  return (
    <LandingSection
      id="apply"
      eyebrow="Заявка"
      title={landingFinal.title}
      description={landingFinal.lead}
    >
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 lg:pt-2">
          <p className="font-display text-3xl leading-snug font-semibold tracking-tight">
            {landingFinal.sideTitle}
          </p>
          <ol className="mt-6 flex max-w-md flex-col gap-3 text-base leading-relaxed text-muted-foreground">
            {landingFinal.steps.map((step, index) => (
              <li key={step}>
                {index + 1}. {step}
              </li>
            ))}
          </ol>
        </div>
        <div className="panel min-w-0 p-5 sm:p-6">
          <LeadForm />
        </div>
      </div>
    </LandingSection>
  );
}
