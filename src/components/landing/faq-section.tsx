import { ChevronDown } from "lucide-react";

import { LandingSection } from "@/components/landing/landing-section";
import { landingFaq } from "@/lib/landing/content";

export function FaqSection() {
  return (
    <LandingSection
      id="faq"
      eyebrow="Вопросы"
      title="Частые вопросы"
      description="Ответы опираются на то, как школа устроена сейчас. Пометкой «нужно утвердить» отмечены места, где правило ещё не оформлено."
    >
      <div className="panel divide-y divide-border overflow-hidden">
        {landingFaq.map((item) => (
          <details key={item.id} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <h3 className="text-base font-medium text-foreground">
                  {item.question}
                </h3>
                {item.draft ? (
                  <span className="mt-1 block text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Нужно утвердить
                  </span>
                ) : null}
              </span>
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
