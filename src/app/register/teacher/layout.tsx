import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Регистрация преподавателя",
};

export default function RegisterTeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
