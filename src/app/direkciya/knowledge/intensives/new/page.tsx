import { IntensiveEditor } from "@/components/intensives/intensive-editor";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string }>;
}) {
  const params = await searchParams;
  return (
    <IntensiveEditor
      libraryScope="school"
      listHref="/direkciya/knowledge"
      editorBase="/direkciya/knowledge/intensives"
      initialFolderId={params.folderId ?? null}
    />
  );
}
