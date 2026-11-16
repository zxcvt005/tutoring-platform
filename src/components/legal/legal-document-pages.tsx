import { LegalDocumentShell } from "@/components/legal/legal-document-shell";
import { MarketingWithdrawControl } from "@/components/legal/marketing-withdraw";
import {
  LEGAL_DOCUMENTS,
  PUBLIC_OFFER_PENDING_NOTICE,
} from "@/lib/legal/documents";
import { marketingConsentParagraphs } from "@/lib/legal/marketing-consent-content";
import { personalDataConsentParagraphs } from "@/lib/legal/personal-data-consent-content";
import { privacyPolicySections } from "@/lib/legal/privacy-policy-content";

function sectionId(title: string, index: number) {
  return `s-${index}-${title.slice(0, 24).replace(/\W+/g, "-").toLowerCase()}`;
}

export function PrivacyPolicyPage() {
  const meta = LEGAL_DOCUMENTS["privacy-policy"];
  const toc = privacyPolicySections
    .filter((s) => s.title !== "Введение")
    .map((s, i) => ({
      id: sectionId(s.title, i),
      label: s.title.length > 72 ? `${s.title.slice(0, 70)}…` : s.title,
    }));

  return (
    <LegalDocumentShell meta={meta} toc={toc}>
      <p className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
        Ниже — полное содержание исходного PDF. Таблица целей обработки в п. 3.1
        при извлечении текста из PDF частично потеряла структуру колонок; для
        сверки матрицы целей используйте{" "}
        <a href={meta.pdfPath!} className="underline-offset-2 hover:underline">
          исходный PDF
        </a>
        . Юридический текст не правился.
      </p>
      {privacyPolicySections.map((section, index) => {
        const id =
          section.title === "Введение"
            ? undefined
            : sectionId(section.title, index);
        return (
          <section key={`${section.title}-${index}`} id={id} className="scroll-mt-28">
            {section.title !== "Введение" ? (
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {section.title}
              </h2>
            ) : null}
            <div className={section.title !== "Введение" ? "mt-3 space-y-3" : "space-y-3"}>
              {section.blocks.map((block, bi) => (
                <p key={bi} className="whitespace-pre-wrap">
                  {block}
                </p>
              ))}
            </div>
          </section>
        );
      })}
    </LegalDocumentShell>
  );
}

export function PersonalDataConsentPage() {
  const meta = LEGAL_DOCUMENTS["personal-data-consent"];
  return (
    <LegalDocumentShell meta={meta}>
      {personalDataConsentParagraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </LegalDocumentShell>
  );
}

export function MarketingConsentPage() {
  const meta = LEGAL_DOCUMENTS["marketing-consent"];
  return (
    <LegalDocumentShell meta={meta}>
      {marketingConsentParagraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
      <div className="mt-8">
        <MarketingWithdrawControl />
      </div>
    </LegalDocumentShell>
  );
}

export function PublicOfferPlaceholderPage() {
  const meta = LEGAL_DOCUMENTS["public-offer"];
  return (
    <LegalDocumentShell meta={meta}>
      <div
        className="rounded-2xl border border-border/60 bg-muted/25 px-4 py-5 sm:px-5"
        role="status"
      >
        <p className="font-display text-lg font-semibold tracking-tight">
          Документ готовится
        </p>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-foreground/90">
          {PUBLIC_OFFER_PENDING_NOTICE}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          На этой странице нет условий договора — заглушка не является
          действующей офертой.
        </p>
      </div>
    </LegalDocumentShell>
  );
}
