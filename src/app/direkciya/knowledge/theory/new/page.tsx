import { TheoryEditor } from "@/components/theory/theory-editor";

export default function Page() {
  return (
    <TheoryEditor
      libraryScope="school"
      listHref="/direkciya/knowledge"
      editorBase="/direkciya/knowledge/theory"
    />
  );
}
