/**
 * Справочники и типы рабочей таблицы «Графические планшеты» (Пресса).
 * Строки привязаны к реальной таблице students (не отдельная копия учеников).
 */

export const GRAPHICS_TABLET_STATUSES = ["not_needed", "ordered"] as const;

export type GraphicsTabletStatus = (typeof GRAPHICS_TABLET_STATUSES)[number];

export const GRAPHICS_TABLET_STATUS_LABEL: Record<
  GraphicsTabletStatus,
  string
> = {
  not_needed: "Не нужен",
  ordered: "Заказал",
};

export function isGraphicsTabletStatus(
  value: unknown
): value is GraphicsTabletStatus {
  return (
    typeof value === "string" &&
    (GRAPHICS_TABLET_STATUSES as readonly string[]).includes(value)
  );
}

export type GraphicsTabletRow = {
  studentId: string;
  studentFullName: string;
  studentStatus: "active" | "paused" | "archived";
  trialCompleted: boolean;
  address: string;
  tabletStatus: GraphicsTabletStatus;
  /** ISO; null — ещё не сохраняли ручные поля для ученика */
  updatedAt: string | null;
};
