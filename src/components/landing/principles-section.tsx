import { LandingSection } from "@/components/landing/landing-section";
import { landingPrinciples } from "@/lib/landing/content";

export function PrinciplesSection() {
  return (
    <LandingSection
      id="system"
      className="bg-muted/40"
      eyebrow="Система"
      title="Как мы ведём к высокому баллу — без режима выживания"
      description="Пять опор одной подготовки. Меняется интенсивность занятий под задачу ученика — сам оффер один."
    >
      <ol className="grid gap-10 lg:grid-cols-2">
        {landingPrinciples.map((item, index) => (
          <li key={item.id} className="min-w-0 border-t border-border pt-5">
            <p className="font-display text-sm font-semibold text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display mt-3 text-2xl font-semibold tracking-tight">
              {item.title}
            </h3>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </li>
        ))}
      </ol>
    </LandingSection>
  );
}
