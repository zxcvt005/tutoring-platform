import type { Metadata } from "next";

import { CabinetShell } from "@/components/layout/cabinet-shell";

export const metadata: Metadata = {
  title: "Кафедра",
};

export default function KafedraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CabinetShell role="kafedra">{children}</CabinetShell>;
}
