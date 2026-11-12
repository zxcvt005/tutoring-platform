import Image from "next/image";

import { ApplyButton } from "@/components/landing/apply-button";
import { LandingSection } from "@/components/landing/landing-section";
import {
  landingTeacherSection,
  landingTeachers,
} from "@/lib/landing/content";

export function TeacherSection() {
  return (
    <LandingSection
      id="teachers"
      eyebrow={landingTeacherSection.eyebrow}
      title={landingTeacherSection.title}
      description={landingTeacherSection.lead}
    >
      <ul className="grid gap-4 lg:grid-cols-3">
        {landingTeachers.map((teacher) => (
          <li key={teacher.id} className="panel flex min-w-0 flex-col overflow-hidden">
            <div className="relative aspect-[4/5] w-full bg-muted">
              <Image
                src={teacher.photo}
                alt={teacher.photoAlt}
                fill
                className="object-cover object-top"
                sizes="(max-width: 1024px) 100vw, 33vw"
              />
            </div>
            <div className="flex flex-1 flex-col gap-3 px-5 py-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {teacher.role}
                </p>
                <h3 className="font-display mt-1 text-2xl font-semibold tracking-tight">
                  {teacher.name}
                </h3>
              </div>
              <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-muted-foreground">
                {teacher.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <p className="mt-auto pt-2 text-sm leading-relaxed text-foreground">
                {teacher.blurb}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <ApplyButton>Познакомиться на диагностике</ApplyButton>
      </div>
    </LandingSection>
  );
}
