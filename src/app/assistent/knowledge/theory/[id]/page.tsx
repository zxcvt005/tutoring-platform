import { TheoryEditor } from "@/components/theory/theory-editor";

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <TheoryEditor
      materialId={id}
      listHref="/assistent/knowledge"
      editorBase="/assistent/knowledge/theory"
    />
  );
}
