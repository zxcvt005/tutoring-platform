import { HomeworkProgressRings } from "@/components/homework/homework-progress-rings";
import { ApplyButton } from "@/components/landing/apply-button";
import { LandingContainer } from "@/components/landing/landing-section";
import { Button } from "@/components/ui/button";
import { formulaCountPhrase, landingHero } from "@/lib/landing/content";

/** Пример интерфейса кабинета. Не результат конкретного ученика и не средний балл школы. */
const demoHomeworkStats = {
  completedCount: 41,
  firstAttemptPercent: 64,
  finalPercent: 82,
  countable: 50,
  firstCorrect: 32,
  eventuallyCorrect: 41,
};

export function LandingHero({ formulaCount }: { formulaCount: number }) {
  return (
    <section className="pt-12 pb-16 sm:pt-20 sm:pb-24">
      <LandingContainer>
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:gap-16">
          <div className="min-w-0">
            <h1 className="font-display max-w-xl text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em] text-foreground sm:text-6xl sm:leading-[1.02]">
              {landingHero.titleLead}
              <span className="mt-1 block text-foreground/80">
                {landingHero.titleRest}
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-foreground/70 sm:text-lg">
              {landingHero.lead}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ApplyButton>{landingHero.primaryCta}</ApplyButton>
              <Button
                nativeButton={false}
                variant="outline"
                className="h-10 rounded-xl border-black/10 bg-auditoria-surface px-4"
                render={<a href={landingHero.secondaryHref} />}
              >
                {landingHero.secondaryCta}
              </Button>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground/70">
              {landingHero.footnote}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] text-foreground/55 uppercase">
              Кабинет ученика
            </p>
            <div className="auditoria-home-card mt-3">
              <HomeworkProgressRings
                stats={demoHomeworkStats}
                totalCount={50}
                embedded
              />
              <p className="mt-5 border-t border-black/10 pt-4 text-sm leading-relaxed text-foreground/70">
                {`Тренажёр формул: в каталоге ${formulaCountPhrase(formulaCount)}.`}
              </p>
            </div>
          </div>
        </div>
      </LandingContainer>
    </section>
  );
}
