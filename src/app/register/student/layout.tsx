import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Регистрация ученика",
};

export default function RegisterStudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
