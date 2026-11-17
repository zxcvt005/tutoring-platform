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
      listHref="/assistent/knowledge"
      editorBase="/assistent/knowledge/intensives"
      initialFolderId={params.folderId ?? null}
    />
  );
}
