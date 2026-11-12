import { AudienceSection } from "@/components/landing/audience-section";
import { BonusesSection } from "@/components/landing/bonuses-section";
import { CompareSection } from "@/components/landing/compare-section";
import { EnvironmentSection } from "@/components/landing/environment-section";
import { FaqSection } from "@/components/landing/faq-section";
import { GuaranteesSection } from "@/components/landing/guarantees-section";
import { LandingApplyProvider } from "@/components/landing/landing-apply-context";
import { LandingBackgroundLayer } from "@/components/landing/landing-background";
import { LandingCta } from "@/components/landing/landing-cta";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { MethodSection } from "@/components/landing/method-section";
import { ParentsSection } from "@/components/landing/parents-section";
import { PlatformExperienceSection } from "@/components/landing/platform-experience-section";
import { PrinciplesSection } from "@/components/landing/principles-section";
import { ProductSection } from "@/components/landing/product-section";
import { ResultsSection } from "@/components/landing/results-section";
import { TeacherSection } from "@/components/landing/teacher-section";
import { FORMULA_CATALOG } from "@/lib/formula-trainer/catalog";

export function LandingPage() {
  const formulaCount = FORMULA_CATALOG.length;

  return (
    <div
      data-landing
      className="relative flex min-h-full flex-1 flex-col"
    >
      <LandingBackgroundLayer />
      <LandingApplyProvider>
        <div className="relative z-10 flex min-h-full flex-1 flex-col">
          <LandingHeader />
          <main className="flex-1 overflow-x-clip pb-10 sm:pb-14">
            <LandingHero formulaCount={formulaCount} />
            <ProductSection />
            <AudienceSection />
            <PrinciplesSection />
            <MethodSection />
            <PlatformExperienceSection />
            <ParentsSection />
            <TeacherSection />
            <ResultsSection />
            <EnvironmentSection />
            <BonusesSection />
            <GuaranteesSection />
            <CompareSection />
            <FaqSection />
            <LandingCta />
          </main>
          <LandingFooter />
        </div>
      </LandingApplyProvider>
    </div>
  );
}
