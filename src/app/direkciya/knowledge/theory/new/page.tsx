import { TheoryEditor } from "@/components/theory/theory-editor";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string }>;
}) {
  const params = await searchParams;
  return (
    <TheoryEditor
      libraryScope="school"
      listHref="/direkciya/knowledge"
      editorBase="/direkciya/knowledge/theory"
      initialFolderId={params.folderId ?? null}
    />
  );
}
