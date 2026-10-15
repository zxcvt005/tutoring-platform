import { createSeedData } from "@/lib/demo/seed";
import type { DemoData } from "@/lib/types";
import { STORAGE_KEY } from "@/lib/types";

export function loadDemoData(): DemoData {
  if (typeof window === "undefined") {
    return createSeedData();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedData();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as DemoData;
    if (!parsed?.teachers?.length || !parsed.currentTeacherId) {
      const seed = createSeedData();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return parsed;
  } catch {
    const seed = createSeedData();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    } catch {
      // квота / приватный режим — работаем в памяти
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
  } catch {
    // ignore
  }
}
