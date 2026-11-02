export function hasTheoryComponent(input: {
  videoUrl?: string | null;
  testId?: string | null;
  fileCount?: number;
}): boolean {
  return (
    Boolean(input.videoUrl?.trim()) ||
    Boolean(input.testId?.trim()) ||
    (input.fileCount ?? 0) > 0
  );
}

export function theoryComponentLabels(input: {
  hasVideo?: boolean;
  hasTest?: boolean;
  fileCount?: number;
}): string[] {
  const labels: string[] = [];
  if (input.hasVideo) labels.push("видео");
  if ((input.fileCount ?? 0) > 0) {
    labels.push(
      (input.fileCount ?? 0) === 1
        ? "конспект"
        : `конспектов: ${input.fileCount}`
    );
  }
  if (input.hasTest) labels.push("тест");
  return labels;
}

export const THEORY_NEED_COMPONENT_MESSAGE =
  "Добавьте хотя бы один компонент: видео, конспект или тест";
