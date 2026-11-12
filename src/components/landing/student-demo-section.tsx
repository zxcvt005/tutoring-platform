import Link from "next/link";

import { LandingSection } from "@/components/landing/landing-section";
import { buttonVariants } from "@/components/ui/button";
import { STUDENT_TOUR_BASE_PATH } from "@/lib/student-tour/constants";
import { cn } from "@/lib/utils";

export function StudentDemoSection() {
  return (
    <LandingSection
      id="student-demo"
      className="bg-background"
      eyebrow="Демо-кабинет"
      title="Посмотрите, как устроено обучение"
      description="Попробуйте личный кабинет ученика самостоятельно — без регистрации."
    >
      <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-gradient-to-br from-pastel-mint/70 via-background to-pastel-blue/50 px-6 py-8 sm:px-10 sm:py-12">
        <div className="max-w-2xl">
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Расписание, домашние задания, история занятий и профиль — как у
            настоящего ученика. Теория и тесты закрыты: материалы открываются
            после подключения к обучению.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={STUDENT_TOUR_BASE_PATH}
              className={cn(
                buttonVariants({ size: "lg" }),
                "rounded-full px-6"
              )}
            >
              Попробовать демо-кабинет
            </Link>
            <Link
              href="/#apply"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "rounded-full px-6"
              )}
            >
              Записаться
            </Link>
          </div>
        </div>
      </div>
    </LandingSection>
  );
}
