import { ChevronDown } from "lucide-react";

import { LandingSection } from "@/components/landing/landing-section";
import { landingFaq } from "@/lib/landing/content";
import { landingSurfaceClass } from "@/lib/landing/ui";

export function FaqSection() {
  return (
    <LandingSection
      id="faq"
      eyebrow="Вопросы"
      title="Частые вопросы"
      description="Коротко о том, как всё устроено сейчас."
    >
      <div
        className={`${landingSurfaceClass} divide-y divide-black/10 overflow-hidden`}
      >
        {landingFaq.map((item) => (
          <details key={item.id} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left marker:content-none [&::-webkit-details-marker]:hidden">
              <h3 className="min-w-0 text-base font-medium text-foreground">
                {item.question}
              </h3>
              <ChevronDown className="size-4 shrink-0 text-foreground/55 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="max-w-3xl pb-4 text-base leading-relaxed text-foreground/70">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </LandingSection>
  );
}
