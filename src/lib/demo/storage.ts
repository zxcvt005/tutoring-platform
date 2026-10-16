import { createSeedData } from "@/lib/demo/seed";
import type { DemoData } from "@/lib/types";
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from "@/lib/types";

function isValidV2(data: unknown): data is DemoData {
  if (!data || typeof data !== "object") return false;
  const d = data as DemoData;
  return (
    d.version === 2 &&
    Array.isArray(d.teachers) &&
    Array.isArray(d.students) &&
    Array.isArray(d.lessons) &&
    Array.isArray(d.topics) &&
    Array.isArray(d.homeworks) &&
    Array.isArray(d.homeworkAssignments) &&
    typeof d.currentTeacherId === "string" &&
    typeof d.direkciyaTeacherId === "string"
  );
}

function clearLegacy(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function loadDemoData(): DemoData {
  if (typeof window === "undefined") {
    return createSeedData();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      clearLegacy();
      const seed = createSeedData();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidV2(parsed) || !parsed.teachers.length) {
      clearLegacy();
      const seed = createSeedData();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    clearLegacy();
    return parsed;
  } catch {
    const seed = createSeedData();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      clearLegacy();
    } catch {
      // квота / приватный режим
    }
    return seed;
  }
}

export function saveDemoData(data: DemoData): { ok: boolean; error?: string } {
  if (typeof window === "undefined") {
    return { ok: true };
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось сохранить в localStorage",
    };
  }
}

export function clearDemoStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    clearLegacy();
  } catch {
    // ignore
  }
}
