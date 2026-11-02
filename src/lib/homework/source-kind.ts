/** Обычное домашнее задание. Теория и интенсивы идут отдельными назначениями. */
export function isHomeworkSource(sourceKind?: string | null): boolean {
  return sourceKind !== "theory" && sourceKind !== "intensive";
}

/** Тест из каталога домашних заданий, а не материал теории или интенсива. */
export function isCatalogHomeworkPurpose(purpose?: string | null): boolean {
  return purpose !== "theory" && purpose !== "intensive";
}
