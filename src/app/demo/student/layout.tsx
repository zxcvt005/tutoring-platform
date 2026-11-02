import type { Metadata } from "next";

import { StudentTourShell } from "@/components/student-tour/tour-shell";
import { StudentTourProvider } from "@/lib/student-tour/provider";

export const metadata: Metadata = {
  title: "Демо-кабинет ученика",
  description:
    "Публичная демонстрация кабинета ученика онлайн-школы Неодин. Без регистрации.",
  robots: { index: true, follow: true },
};

export default function StudentTourLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StudentTourProvider>
      <StudentTourShell>{children}</StudentTourShell>
    </StudentTourProvider>
  );
}
