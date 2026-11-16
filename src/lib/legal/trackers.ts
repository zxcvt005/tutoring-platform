/**
 * Реестр сторонних трекеров.
 * Не выдумывать интеграции: только то, что реально подключено в коде.
 * Сейчас необязательных трекеров нет — gate готов к будущему подключению.
 */

import {
  optionalTrackersAllowed,
  readLegalClientPrefs,
  type LegalClientPrefs,
} from "@/lib/legal/client-prefs";

export type TrackerId = "yandex_metrika";

export type TrackerDescriptor = {
  id: TrackerId;
  label: string;
  category: "analytics" | "marketing";
  /** true только если скрипт/SDK реально есть в проекте */
  connected: boolean;
};

export const TRACKERS: TrackerDescriptor[] = [
  {
    id: "yandex_metrika",
    label: "Яндекс.Метрика",
    category: "analytics",
    connected: false,
  },
];

export function connectedOptionalTrackers(): TrackerDescriptor[] {
  return TRACKERS.filter((t) => t.connected);
}

export function hasConnectedOptionalTrackers(): boolean {
  return connectedOptionalTrackers().length > 0;
}

/** Можно ли запускать трекер данной категории при текущих prefs. */
export function mayRunTrackerCategory(
  category: "analytics" | "marketing",
  prefs: LegalClientPrefs = readLegalClientPrefs()
): boolean {
  const allowed = optionalTrackersAllowed(prefs);
  return category === "analytics" ? allowed.analytics : allowed.marketing;
}

/**
 * Точка входа для будущего подключения аналитики.
 * Пока трекеров нет — no-op. Не запускать скрипты до согласия.
 */
export function syncOptionalTrackers(
  prefs: LegalClientPrefs = readLegalClientPrefs()
): void {
  if (typeof window === "undefined") return;
  for (const tracker of connectedOptionalTrackers()) {
    const allowed = mayRunTrackerCategory(tracker.category, prefs);
    if (!allowed) {
      // При подключении: unload / disable здесь.
      continue;
    }
    // При подключении: load script здесь.
    void tracker.id;
  }
}
