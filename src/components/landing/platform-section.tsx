import { LandingSection } from "@/components/landing/landing-section";
import { PlatformShowcase } from "@/components/landing/platform-showcase";

export function PlatformSection({
  formulaCount,
  trainerGroups,
}: {
  formulaCount: number;
  trainerGroups: readonly string[];
}) {
  return (
    <LandingSection
      id="platform"
      className="bg-muted/40"
      eyebrow="Платформа"
      title="Вся подготовка в одном кабинете"
      description="Задания, теория, расписание, формулы и видеозвонок не разъезжаются по чатам. Ниже — настоящие экраны ученического кабинета. Показаны пустые состояния: чужие результаты на сайт не выносятся."
    >
      <PlatformShowcase
        formulaCount={formulaCount}
        trainerGroups={trainerGroups}
      />
    </LandingSection>
  );
}
