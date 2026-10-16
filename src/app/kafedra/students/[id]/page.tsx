import { StudentDetail } from "@/components/students/student-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentDetail studentId={id} mode="kafedra" />;
}
