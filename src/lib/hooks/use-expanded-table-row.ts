"use client";

import { useCallback, useState } from "react";

/**
 * Одна раскрытая строка таблицы Дирекции.
 * Повторный клик сворачивает; выбор другой строки сворачивает предыдущую.
 */
export function useExpandedTableRow() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isExpanded = useCallback(
    (id: string) => expandedId === id,
    [expandedId]
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const expand = useCallback((id: string) => {
    setExpandedId(id);
  }, []);

  const collapse = useCallback(() => {
    setExpandedId(null);
  }, []);

  return { expandedId, isExpanded, toggleExpanded, expand, collapse };
}
