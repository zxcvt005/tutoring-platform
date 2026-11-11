import { TheoryEditor } from "@/components/theory/theory-editor";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string }>;
}) {
  const params = await searchParams;
  return <TheoryEditor initialFolderId={params.folderId ?? null} />;
}
