import { IntensiveEditor } from "@/components/intensives/intensive-editor";

export default function Page() {
  return (
    <IntensiveEditor
      libraryScope="school"
      listHref="/assistent/knowledge"
      editorBase="/assistent/knowledge/intensives"
    />
  );
}
