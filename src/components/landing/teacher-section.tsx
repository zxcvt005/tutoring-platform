import { LandingSection } from "@/components/landing/landing-section";
import { landingTeacher } from "@/lib/landing/content";

export function TeacherSection() {
  return (
    <LandingSection
      id="teacher"
      eyebrow="Преподаватель"
      title={landingTeacher.title}
      description={landingTeacher.text}
    >
      <div className="grid items-stretch gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="panel flex min-h-64 items-end p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Фото появится здесь, когда школа согласует портрет для сайта.
          </p>
        </div>
        <ul className="panel flex flex-col justify-center gap-4 px-6 py-6 text-base leading-relaxed text-muted-foreground">
          <li>Имя и фото — после согласования.</li>
          <li>Образование и стаж — только если они подтверждены.</li>
          <li>Результаты учеников публикуются только по согласованной выборке.</li>
        </ul>
      </div>
    </LandingSection>
  );
}
