import type { Metadata } from "next";

import { requireCabinetMembership } from "@/server/auth/cabinet-guard";

export const metadata: Metadata = {
  title: "Регистрация ученика",
};

/** Онбординг без оболочки кабинета — нельзя уйти в Аудиторию до завершения. */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCabinetMembership("auditoria");
  return <>{children}</>;
}
