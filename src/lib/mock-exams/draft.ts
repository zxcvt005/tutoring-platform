import { normalizePart2Score, PART2_TASKS } from "@/lib/mock-exams/ege";

export const EGE_DRAFT_STORAGE_KEY = "neodin.ege-physics.draft.v1";

const PART1_COUNT = 20;
const ANSWER_LIMIT = 80;

export type EgeCheckerMode = "references" | "check";

export type EgeDraft = {
  mode: EgeCheckerMode;
  references: string[];
  answers: string[];
  part2: (number | null)[];
};

function blankList(length: number): string[] {
  return Array.from({ length }, () => "");
}

export function createEmptyEgeDraft(): EgeDraft {
  return {
    mode: "check",
    references: blankList(PART1_COUNT),
    answers: blankList(PART1_COUNT),
    part2: PART2_TASKS.map(() => null),
  };
}

function cleanAnswer(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(value).slice(0, ANSWER_LIMIT).join("");
}

function cleanList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  return blankList(PART1_COUNT).map((_, index) => cleanAnswer(source[index]));
}

export function parseEgeDraft(raw: string | null): EgeDraft {
  const empty = createEmptyEgeDraft();
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
  const record = parsed as Record<string, unknown>;
  const part2Source = Array.isArray(record.part2) ? record.part2 : [];
  return {
    mode: record.mode === "references" ? "references" : "check",
    references: cleanList(record.references),
    answers: cleanList(record.answers),
    part2: PART2_TASKS.map((task, index) =>
      normalizePart2Score(task.number, part2Source[index])
    ),
  };
}

export function serializeEgeDraft(draft: EgeDraft): string {
  return JSON.stringify(parseEgeDraft(JSON.stringify(draft)));
}

export function readEgeDraft(storage: Pick<Storage, "getItem">): EgeDraft {
  try {
    return parseEgeDraft(storage.getItem(EGE_DRAFT_STORAGE_KEY));
  } catch {
    return createEmptyEgeDraft();
  }
}

export function writeEgeDraft(
  storage: Pick<Storage, "setItem">,
  draft: EgeDraft
): void {
  storage.setItem(EGE_DRAFT_STORAGE_KEY, serializeEgeDraft(draft));
}

const draftListeners = new Set<() => void>();

export function subscribeEgeDraft(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => {
    draftListeners.delete(listener);
  };
}

export function getEgeDraftSnapshot(): string {
  return window.localStorage.getItem(EGE_DRAFT_STORAGE_KEY) ?? "";
}

export function getEgeDraftServerSnapshot(): string {
  return "";
}

export function emitEgeDraft(): void {
  for (const listener of draftListeners) listener();
}
