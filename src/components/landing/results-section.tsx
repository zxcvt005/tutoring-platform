import { CaseChats } from "@/components/landing/case-chats";
import { LandingNextStep } from "@/components/landing/landing-next-step";
import { LandingSection } from "@/components/landing/landing-section";
import { ReviewsCarousel } from "@/components/landing/reviews-carousel";
import { loadLandingResults } from "@/lib/landing/results-media";
import {
  landingAverageScore,
  landingScoreCount,
  landingScoreYears,
} from "@/lib/landing/results";
import { landingSurfacePadClass } from "@/lib/landing/ui";
import { cn } from "@/lib/utils";

export function ResultsSection() {
  const { cases, reviews } = loadLandingResults();

  return (
    <LandingSection
      id="results"
      eyebrow="Доверие"
      title="Результаты, которые можно проверить"
      description="Средний балл, результаты по годам и истории учеников. Цифры и переписки — из реальной подготовки."
    >
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.4fr)]">
        <article
          className={cn(
            landingSurfacePadClass,
            "flex min-h-56 flex-col justify-between surface-sand sm:min-h-72 sm:p-8"
          )}
        >
          <h3 className="text-xs font-semibold tracking-[0.16em] text-foreground/55 uppercase">
            Средний результат учеников
          </h3>
          <p className="font-display mt-8 text-7xl leading-none font-semibold tracking-[-0.04em] sm:text-8xl">
            {landingAverageScore}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-foreground/70">
            По {landingScoreCount()} опубликованным результатам 2023–2026.
          </p>
        </article>

        <article className={cn(landingSurfacePadClass, "min-w-0 sm:p-8")}>
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            Результаты учеников
          </h3>
          <div className="mt-6 flex flex-col gap-6">
            {landingScoreYears.map((group) => (
              <div key={group.year}>
                <p className="text-xs font-semibold tracking-[0.14em] text-foreground/55 uppercase">
                  {group.year}
                </p>
                <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  {group.scores.map((score, scoreIndex) => (
                    <li
                      key={`${group.year}-${scoreIndex}`}
                      className="font-display text-2xl leading-none font-semibold tracking-tight tabular-nums"
                    >
                      {score}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="mt-16">
        <h3 className="font-display max-w-2xl text-3xl font-semibold tracking-tight">
          Как дошли до балла
        </h3>
        <div className="mt-4 grid gap-4">
          {cases.map((item) => (
            <article
              key={item.id}
              className={cn(
                landingSurfacePadClass,
                "grid items-start gap-8 sm:p-8 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(16rem,22rem)] lg:gap-10"
              )}
            >
              <div className="min-w-0">
                {item.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photo}
                    alt={item.name}
                    className="h-auto w-full max-w-xs rounded-2xl"
                  />
                ) : (
                  <div
                    className={cn(
                      landingSurfacePadClass,
                      "flex min-h-48 items-end bg-pastel-beige/60"
                    )}
                  >
                    <p className="text-sm leading-relaxed text-foreground/70">
                      Фото пока не добавлено.
                    </p>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <h4 className="font-display text-3xl font-semibold tracking-tight">
                  {item.name}
                </h4>
                <p className="mt-3 font-display text-lg text-foreground/70">
                  <span>{item.startLabel}</span>
                  <span aria-hidden> → </span>
                  <span className="text-4xl font-semibold tracking-tight text-foreground">
                    {item.result}
                  </span>
                  <span> баллов</span>
                </p>
                <div className="mt-4 flex max-w-xl flex-col gap-3 text-base leading-relaxed text-foreground/70">
                  {item.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>

              <CaseChats name={item.name} sources={item.chats} />
            </article>
          ))}
        </div>
      </div>

      <ReviewsCarousel reviews={reviews} />

      <LandingNextStep
        title="Сначала уровень, потом обещания"
        text="Диагностика показывает, откуда начинать. Балл на витрине её не заменяет."
      />
    </LandingSection>
  );
}
