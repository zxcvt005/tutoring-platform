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

export function readStudentTourState(): StoredStudentTour {
  if (!canUseStorage()) return createFreshStudentTourState();
  try {
    const raw = localStorage.getItem(STUDENT_TOUR_STORAGE_KEY);
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
export function readStudentTourData(): DemoData {
  return readStudentTourState().data;
}

export function writeStudentTourState(state: StoredStudentTour): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(
      STUDENT_TOUR_STORAGE_KEY,
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

export function writeStudentTourData(data: DemoData): void {
  const current = readStudentTourState();
  writeStudentTourState({ ...current, data });
}

export function clearStudentTourData(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STUDENT_TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
}
