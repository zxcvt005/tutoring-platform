import type { Metadata } from "next";

import { CabinetShell } from "@/components/layout/cabinet-shell";
import { requireCabinetMembership } from "@/server/auth/cabinet-guard";

export const metadata: Metadata = {
  title: "Ассистент",
};

export default async function AssistentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCabinetMembership("assistent");
  return <CabinetShell role="assistent">{children}</CabinetShell>;
}
