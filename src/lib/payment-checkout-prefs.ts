/**
 * Предпочтения каталога оплаты ученика (тариф + вариант) по направлениям.
 * Хранятся в localStorage, ключ включает studentId.
 */

export type DirectionCheckoutPref = {
  tariffId: string;
  optionId: string;
};

export type StudentCheckoutPrefs = {
  lastDirectionId: string | null;
  byDirection: Record<string, DirectionCheckoutPref>;
};

const STORAGE_PREFIX = "neodin.pay.checkout-prefs.v1.";

function storageKey(studentId: string): string {
  return `${STORAGE_PREFIX}${studentId}`;
}

function emptyPrefs(): StudentCheckoutPrefs {
  return { lastDirectionId: null, byDirection: {} };
}

export function loadStudentCheckoutPrefs(
  studentId: string,
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): StudentCheckoutPrefs {
  if (!studentId || !storage) return emptyPrefs();
  try {
    const raw = storage.getItem(storageKey(studentId));
    if (!raw) return emptyPrefs();
    const parsed = JSON.parse(raw) as Partial<StudentCheckoutPrefs>;
    const byDirection: Record<string, DirectionCheckoutPref> = {};
    if (parsed.byDirection && typeof parsed.byDirection === "object") {
      for (const [dirId, pref] of Object.entries(parsed.byDirection)) {
        if (
          pref &&
          typeof pref.tariffId === "string" &&
          typeof pref.optionId === "string" &&
          pref.tariffId &&
          pref.optionId
        ) {
          byDirection[dirId] = {
            tariffId: pref.tariffId,
            optionId: pref.optionId,
          };
        }
      }
    }
    return {
      lastDirectionId:
        typeof parsed.lastDirectionId === "string" && parsed.lastDirectionId
          ? parsed.lastDirectionId
          : null,
      byDirection,
    };
  } catch {
    return emptyPrefs();
  }
}

export function saveStudentCheckoutPrefs(
  studentId: string,
  prefs: StudentCheckoutPrefs,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): void {
  if (!studentId || !storage) return;
  try {
    storage.setItem(storageKey(studentId), JSON.stringify(prefs));
  } catch {
    // quota / private mode — игнорируем
  }
}

export type PurchasableTariff = {
  id: string;
  purchaseOptions?: { id: string; isActive: boolean; sortOrder: number }[];
};

/**
 * Выбирает доступный тариф и вариант с учётом сохранённого предпочтения.
 * Неактивные / отсутствующие id отбрасываются.
 */
export function resolveCheckoutSelection(input: {
  tariffs: PurchasableTariff[];
  preferred?: DirectionCheckoutPref | null;
}): { tariffId: string; optionId: string } | null {
  const tariffs = input.tariffs
    .map((t) => ({
      id: t.id,
      options: [...(t.purchaseOptions ?? [])]
        .filter((o) => o.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((t) => t.options.length > 0);

  if (tariffs.length === 0) return null;

  const preferred = input.preferred;
  if (preferred) {
    const match = tariffs.find((t) => t.id === preferred.tariffId);
    if (match) {
      const option =
        match.options.find((o) => o.id === preferred.optionId) ??
        match.options[0]!;
      return { tariffId: match.id, optionId: option.id };
    }
  }

  const first = tariffs[0]!;
  return { tariffId: first.id, optionId: first.options[0]!.id };
}

export function resolveCheckoutDirectionId(
  activeDirectionIds: string[],
  preferredDirectionId: string | null | undefined
): string {
  if (
    preferredDirectionId &&
    activeDirectionIds.includes(preferredDirectionId)
  ) {
    return preferredDirectionId;
  }
  return activeDirectionIds[0] ?? "";
}
