import { IntensiveEditor } from "@/components/intensives/intensive-editor";

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <IntensiveEditor
      intensiveId={id}
      listHref="/assistent/knowledge"
      editorBase="/assistent/knowledge/intensives"
    />
  );
}
