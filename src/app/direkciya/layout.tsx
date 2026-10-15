import { CabinetShell } from "@/components/layout/cabinet-shell";

export default function DirekciyaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CabinetShell role="direkciya">{children}</CabinetShell>;
}
