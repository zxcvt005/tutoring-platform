/** Пустое, пробельное и отсутствующее описание теста не подменяется текстом. */
export function normalizeOptionalDescription(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
