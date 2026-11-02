import { IntensiveEditor } from "@/components/intensives/intensive-editor";

export default function Page() {
  return (
    <IntensiveEditor
      libraryScope="school"
      listHref="/direkciya/knowledge"
      editorBase="/direkciya/knowledge/intensives"
    />
  );
}
