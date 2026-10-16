import { TopicDetail } from "@/components/topics/topic-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TopicDetail topicId={id} />;
}
