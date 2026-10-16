import { TeacherDetail } from "@/components/teachers/teacher-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TeacherDetail teacherId={id} />;
}
