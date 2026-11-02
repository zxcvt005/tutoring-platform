import {
  allSubsectionIds,
  FORMULA_CATALOG,
  formulasInSubsections,
  subsectionsForGroup,
  TRAINER_GROUPS,
} from "@/lib/formula-trainer/catalog";
import {
  subsectionIsWeak,
  WEAK_TOPIC_CLEAR_STREAK,
} from "@/lib/formula-trainer/selection";
import type {
  FormulaProgressRow,
  FormulaSubsectionId,
  TrainerGroupId,
  TrainerSettings,
} from "@/lib/formula-trainer/types";

export const TRAINER_QUESTION_COUNTS = [5, 10, 15, 20] as const;

export type TrainerQuestionCount = (typeof TRAINER_QUESTION_COUNTS)[number];

export type TrainerSetupTab = "section" | "weak" | "custom";

export type WeakTopic = {
  subsectionId: FormulaSubsectionId;
  title: string;
  formulaCount: number;
};

function formulaWord(count: number): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "формула";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "формулы";
  return "формул";
}

export function listWeakTopics(
  progress: Pick<
    FormulaProgressRow,
    | "formulaId"
    | "attempts"
    | "correctCount"
    | "wrongCount"
    | "status"
    | "streak"
    | "lastAttemptAt"
    | "nextReviewAt"
  >[]
): WeakTopic[] {
  const byId = new Map(
    progress.map((row) => [row.formulaId, row as FormulaProgressRow])
  );
  const bySub = new Map<
    FormulaSubsectionId,
    (typeof FORMULA_CATALOG)[number][]
  >();
  for (const formula of FORMULA_CATALOG) {
    const list = bySub.get(formula.subsectionId) ?? [];
    list.push(formula);
    bySub.set(formula.subsectionId, list);
  }
  const topics: WeakTopic[] = [];
  for (const [subsectionId, formulas] of bySub) {
    if (!subsectionIsWeak(formulas, byId)) continue;
    topics.push({
      subsectionId,
      title: formulas[0]!.subsectionTitle,
      formulaCount: formulas.filter(
        (formula) => (byId.get(formula.id)?.streak ?? 0) < WEAK_TOPIC_CLEAR_STREAK
      ).length,
    });
  }
  return topics;
}

export function trainerHomeSummary(
  progress: Parameters<typeof listWeakTopics>[0]
): {
  formulaCount: number;
  practicedCount: number;
  progressLabel: string;
  weakTopics: WeakTopic[];
} {
  const known = new Set(FORMULA_CATALOG.map((formula) => formula.id));
  const practiced = new Set(
    progress
      .filter((row) => row.attempts > 0 && known.has(row.formulaId))
      .map((row) => row.formulaId)
  );
  const formulaCount = FORMULA_CATALOG.length;
  const weakTopics = listWeakTopics(progress);
  return {
    formulaCount,
    practicedCount: practiced.size,
    progressLabel:
      practiced.size === 0
        ? "Нет данных"
        : `${practiced.size} из ${formulaCount}`,
    weakTopics,
  };
}

export function toggleTrainerGroup(
  selected: readonly TrainerGroupId[],
  groupId: TrainerGroupId
): TrainerGroupId[] {
  return selected.includes(groupId)
    ? selected.filter((id) => id !== groupId)
    : [...selected, groupId];
}

/** Объединение подразделов выбранных разделов, без повторов. */
export function subsectionIdsForGroups(
  groupIds: readonly TrainerGroupId[]
): FormulaSubsectionId[] {
  const ids: FormulaSubsectionId[] = [];
  const seen = new Set<string>();
  for (const groupId of groupIds) {
    for (const id of subsectionsForGroup(groupId)) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Формулы объединения разделов. Каждая формула каталога входит не больше одного раза. */
export function uniqueFormulaIdsForGroups(
  groupIds: readonly TrainerGroupId[]
): string[] {
  const subsections = new Set(subsectionIdsForGroups(groupIds));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const formula of FORMULA_CATALOG) {
    if (!subsections.has(formula.subsectionId) || seen.has(formula.id)) continue;
    seen.add(formula.id);
    ids.push(formula.id);
  }
  return ids;
}

export function availableFormulaCount(input: {
  tab: TrainerSetupTab;
  groupIds: readonly TrainerGroupId[];
  subsectionIds: FormulaSubsectionId[];
  progress: Parameters<typeof listWeakTopics>[0];
}): number {
  if (input.tab === "section") {
    if (input.groupIds.length === 0) return 0;
    return uniqueFormulaIdsForGroups(input.groupIds).length;
  }
  if (input.tab === "custom") {
    if (input.subsectionIds.length === 0) return 0;
    return formulasInSubsections(input.subsectionIds).length;
  }
  const weakIds = new Set(
    listWeakTopics(input.progress).flatMap((topic) =>
      input.subsectionIds.length === 0 ||
      input.subsectionIds.includes(topic.subsectionId)
        ? [topic.subsectionId]
        : []
    )
  );
  return FORMULA_CATALOG.filter((formula) => weakIds.has(formula.subsectionId))
    .length;
}

function groupsMatchingSubsections(
  saved: readonly FormulaSubsectionId[]
): TrainerGroupId[] | null {
  if (saved.length === 0) return null;
  const savedSet = new Set(saved);
  const matched: TrainerGroupId[] = [];
  const covered = new Set<FormulaSubsectionId>();
  for (const group of TRAINER_GROUPS) {
    const subs = subsectionsForGroup(group.id);
    if (subs.length === 0 || !subs.every((id) => savedSet.has(id))) continue;
    matched.push(group.id);
    for (const id of subs) covered.add(id);
  }
  if (matched.length === 0 || covered.size !== savedSet.size) return null;
  if (![...savedSet].every((id) => covered.has(id))) return null;
  return matched;
}

export function setupFromSettings(settings: TrainerSettings): {
  tab: TrainerSetupTab;
  groupIds: TrainerGroupId[];
  customIds: FormulaSubsectionId[];
  weakIds: FormulaSubsectionId[];
} {
  const saved = settings.selectedSubsectionIds;
  const all = allSubsectionIds();
  const isAll =
    saved.length > 0 &&
    all.length === saved.length &&
    all.every((id) => saved.includes(id));
  const matchedGroups = groupsMatchingSubsections(saved);

  if (settings.weakSpotsOnly) {
    return {
      tab: "weak",
      groupIds: [],
      customIds: [],
      weakIds: isAll || saved.length === 0 ? [] : saved,
    };
  }
  if (matchedGroups) {
    return {
      tab: "section",
      groupIds: matchedGroups,
      customIds: [],
      weakIds: [],
    };
  }
  if (saved.length === 0) {
    return { tab: "section", groupIds: [], customIds: [], weakIds: [] };
  }
  return { tab: "custom", groupIds: [], customIds: saved, weakIds: [] };
}

export const CORRECT_ANSWER_CONFIRMATION = {
  title: "Верно!",
  detail: "Отличная работа, продолжай.",
  autoAdvance: false,
} as const;

/** Обновлять карточку после закрытия только если в этом открытии уже сохранён ответ. */
export function shouldRefreshAfterTrainerClose(answersSaved: boolean): boolean {
  return answersSaved;
}

export function trainerSessionStartCheck(
  available: number,
  requested: number
): { ok: true } | { ok: false; message: string } {
  if (!TRAINER_QUESTION_COUNTS.includes(requested as TrainerQuestionCount)) {
    return { ok: false, message: "Выберите количество вопросов" };
  }
  if (available <= 0) {
    return {
      ok: false,
      message: "В выбранном наборе нет формул для тренировки",
    };
  }
  if (available < requested) {
    return {
      ok: false,
      message: `В этом наборе ${available} ${formulaWord(available)}. Выберите меньшее число вопросов.`,
    };
  }
  return { ok: true };
}
