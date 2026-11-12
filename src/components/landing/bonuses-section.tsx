import { LandingSection } from "@/components/landing/landing-section";
import { landingBonuses } from "@/lib/landing/content";
import { landingSurfacePadClass } from "@/lib/landing/ui";

export function BonusesSection() {
  return (
    <LandingSection
      id="bonuses"
      eyebrow="Вокруг экзамена"
      title="Что ещё входит в путь к экзамену и поступлению"
      description="Материалы и консультации вокруг подготовки — не вместо занятий, а чтобы закрыть пробелы вокруг них."
    >
      <ol className="grid gap-4 sm:grid-cols-2">
        {landingBonuses.items.map((item, index) => (
          <li key={item.id} className={landingSurfacePadClass}>
            <p className="text-xs font-semibold tracking-[0.14em] text-foreground/55 uppercase">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display mt-3 text-xl font-semibold tracking-tight">
              {item.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70 sm:text-base">
              {item.text}
            </p>
          </li>
        ))}
      </ol>
    </LandingSection>
  );
}
