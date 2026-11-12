import { ChevronDown } from "lucide-react";

import { LandingSection } from "@/components/landing/landing-section";
import { landingFaq } from "@/lib/landing/content";

export function FaqSection() {
  return (
    <LandingSection
      id="faq"
      eyebrow="Вопросы"
      title="Частые вопросы"
      description="Коротко о том, как всё устроено сейчас."
    >
      <div className="panel divide-y divide-border overflow-hidden">
        {landingFaq.map((item) => (
          <details key={item.id} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left marker:content-none [&::-webkit-details-marker]:hidden">
              <h3 className="min-w-0 text-base font-medium text-foreground">
                {item.question}
              </h3>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="max-w-3xl pb-4 text-base leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </LandingSection>
  );
}
