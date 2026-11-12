import { LandingSection } from "@/components/landing/landing-section";
import { landingPrinciples } from "@/lib/landing/content";
import { landingSurfacePadClass } from "@/lib/landing/ui";

export function PrinciplesSection() {
  return (
    <LandingSection
      id="system"
      eyebrow="Система"
      title="Как мы ведём к высокому баллу — без режима выживания"
      description="Пять опор одной подготовки. Меняется интенсивность занятий под задачу ученика — сам оффер один."
    >
      <ol className="grid gap-4 lg:grid-cols-2">
        {landingPrinciples.map((item, index) => (
          <li key={item.id} className={landingSurfacePadClass}>
            <p className="font-display text-sm font-semibold text-foreground/55">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display mt-3 text-2xl font-semibold tracking-tight">
              {item.title}
            </h3>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-foreground/70">
              {item.description}
            </p>
          </li>
        ))}
      </ol>
    </LandingSection>
  );
}
