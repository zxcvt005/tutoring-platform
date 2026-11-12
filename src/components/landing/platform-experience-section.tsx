"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { EmbeddedStudentCabinet } from "@/components/landing/embedded-student-cabinet";
import { LandingSection } from "@/components/landing/landing-section";
import { buttonVariants } from "@/components/ui/button";
import { landingPlatform } from "@/lib/landing/content";
import { landingSurfacePadClass } from "@/lib/landing/ui";
import { STUDENT_TOUR_BASE_PATH } from "@/lib/student-tour/constants";
import { cn } from "@/lib/utils";

export function PlatformExperienceSection() {
  return (
    <LandingSection
      id="platform"
      eyebrow={landingPlatform.eyebrow}
      title={landingPlatform.title}
      description={landingPlatform.lead}
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(15rem,0.8fr)] xl:gap-8">
        <div className="min-w-0">
          <EmbeddedStudentCabinet />
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {landingPlatform.features.map((feature) => (
            <article key={feature.id} className={landingSurfacePadClass}>
              <h3 className="font-display text-xl font-semibold tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70 sm:text-base">
                {feature.text}
              </p>
            </article>
          ))}
          <Link
            href={landingPlatform.openDemoHref || STUDENT_TOUR_BASE_PATH}
            className={cn(
              buttonVariants(),
              "h-10 justify-center rounded-xl px-4"
            )}
          >
            {landingPlatform.openDemo}
            <ExternalLink className="size-4" />
          </Link>
        </aside>
      </div>
    </LandingSection>
  );
}
