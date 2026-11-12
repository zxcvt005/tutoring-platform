import {
  STUDENT_TOUR_STORAGE_KEY,
  STUDENT_TOUR_STORAGE_VERSION,
} from "@/lib/student-tour/constants";
import {
  createStudentTourExtras,
  createStudentTourSeed,
} from "@/lib/student-tour/seed";
import type { StudentTourExtras } from "@/lib/student-tour/types";
import type { DemoData } from "@/lib/types";

export type StoredStudentTour = {
  version: typeof STUDENT_TOUR_STORAGE_VERSION;
  data: DemoData;
  extras: StudentTourExtras;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function createFreshStudentTourState(): StoredStudentTour {
  return {
    version: STUDENT_TOUR_STORAGE_VERSION,
    data: createStudentTourSeed(),
    extras: createStudentTourExtras(),
  };
}

export function readStudentTourState(
  storageKey: string = STUDENT_TOUR_STORAGE_KEY
): StoredStudentTour {
  if (!canUseStorage()) return createFreshStudentTourState();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return createFreshStudentTourState();
    const parsed = JSON.parse(raw) as Partial<StoredStudentTour>;
    if (
      parsed?.version !== STUDENT_TOUR_STORAGE_VERSION ||
      !parsed.data ||
      parsed.data.version !== 6 ||
      !parsed.extras
    ) {
      return createFreshStudentTourState();
    }
    return {
      version: STUDENT_TOUR_STORAGE_VERSION,
      data: parsed.data,
      extras: {
        calls: parsed.extras.calls ?? [],
        notifications: parsed.extras.notifications ?? [],
        trainerHistory: parsed.extras.trainerHistory ?? [],
      },
    };
  } catch {
    return createFreshStudentTourState();
  }
}

/** Совместимость со старым API чтения только DemoData. */
export function readStudentTourData(
  storageKey: string = STUDENT_TOUR_STORAGE_KEY
): DemoData {
  return readStudentTourState(storageKey).data;
}

export function writeStudentTourState(
  state: StoredStudentTour,
  storageKey: string = STUDENT_TOUR_STORAGE_KEY
): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: STUDENT_TOUR_STORAGE_VERSION,
        data: state.data,
        extras: state.extras,
      } satisfies StoredStudentTour)
    );
  } catch {
    // ignore quota / private mode
  }
}

export function writeStudentTourData(
  data: DemoData,
  storageKey: string = STUDENT_TOUR_STORAGE_KEY
): void {
  const current = readStudentTourState(storageKey);
  writeStudentTourState({ ...current, data }, storageKey);
}

export function clearStudentTourData(
  storageKey: string = STUDENT_TOUR_STORAGE_KEY
): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
