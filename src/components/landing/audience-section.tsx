import { LandingSection } from "@/components/landing/landing-section";
import { landingAudience } from "@/lib/landing/content";

export function AudienceSection() {
  return (
    <LandingSection
      id="audience"
      className="bg-muted/40"
      eyebrow={landingAudience.eyebrow}
      title={landingAudience.title}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="panel px-6 py-7">
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            {landingAudience.parents.title}
          </h3>
          <ul className="mt-4 flex flex-col gap-3 text-base leading-relaxed text-muted-foreground">
            {landingAudience.parents.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="panel-soft surface-sky px-6 py-7">
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            {landingAudience.students.title}
          </h3>
          <ul className="mt-4 flex flex-col gap-3 text-base leading-relaxed text-muted-foreground">
            {landingAudience.students.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
      <p className="mt-8 max-w-3xl text-base leading-relaxed text-foreground">
        {landingAudience.closing}
      </p>
    </LandingSection>
  );
}
