import { TheoryEditor } from "@/components/theory/theory-editor";

export default function Page() {
  return (
    <TheoryEditor
      libraryScope="school"
      listHref="/assistent/knowledge"
      editorBase="/assistent/knowledge/theory"
    />
  );
}
