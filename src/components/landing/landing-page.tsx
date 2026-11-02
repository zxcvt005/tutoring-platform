import { AdmissionSection } from "@/components/landing/admission-section";
import { BonusesSection } from "@/components/landing/bonuses-section";
import { CompareSection } from "@/components/landing/compare-section";
import { EnvironmentSection } from "@/components/landing/environment-section";
import { FaqSection } from "@/components/landing/faq-section";
import { GuaranteesSection } from "@/components/landing/guarantees-section";
import { LandingApplyProvider } from "@/components/landing/landing-apply-context";
import { LandingCta } from "@/components/landing/landing-cta";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { MethodSection } from "@/components/landing/method-section";
import { ParentsSection } from "@/components/landing/parents-section";
import { PathSection } from "@/components/landing/path-section";
import { PlatformSection } from "@/components/landing/platform-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { PrinciplesSection } from "@/components/landing/principles-section";
import { ResultsSection } from "@/components/landing/results-section";
import { StudentDemoSection } from "@/components/landing/student-demo-section";
import { TeacherSection } from "@/components/landing/teacher-section";
import { FORMULA_CATALOG, TRAINER_GROUPS } from "@/lib/formula-trainer/catalog";

export function LandingPage() {
  const formulaCount = FORMULA_CATALOG.length;
  const trainerGroups = TRAINER_GROUPS.map((group) => group.title);

  return (
    <div
      data-landing
      className="flex min-h-full flex-1 flex-col overflow-x-hidden bg-background"
    >
      <LandingApplyProvider>
        <LandingHeader />
        <main className="flex-1">
          <LandingHero formulaCount={formulaCount} />
          <ResultsSection />
          <PrinciplesSection />
          <PathSection />
          <MethodSection />
          <PlatformSection
            formulaCount={formulaCount}
            trainerGroups={trainerGroups}
          />
          <StudentDemoSection />
          <ParentsSection />
          <EnvironmentSection />
          <BonusesSection />
          <GuaranteesSection />
          <CompareSection />
          <TeacherSection />
          <AdmissionSection />
          <PricingSection />
          <FaqSection />
          <LandingCta />
        </main>
        <LandingFooter />
      </LandingApplyProvider>
    </div>
  );
}
