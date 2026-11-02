import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  allSubsectionIds,
  FORMULA_CATALOG,
  subsectionsForGroup,
  TRAINER_GROUPS,
} from "@/lib/formula-trainer/catalog";
import {
  availableFormulaCount,
  CORRECT_ANSWER_CONFIRMATION,
  setupFromSettings,
  shouldRefreshAfterTrainerClose,
  toggleTrainerGroup,
  uniqueFormulaIdsForGroups,
  listWeakTopics,
  trainerHomeSummary,
  trainerSessionStartCheck,
} from "@/lib/formula-trainer/display";
import { DEFAULT_TRAINER_SETTINGS } from "@/lib/formula-trainer/types";
import { applyAttempt, emptyProgress } from "@/lib/formula-trainer/progress";
import { formulaIsWeak } from "@/lib/formula-trainer/selection";

describe("formula trainer display", () => {
  it("does not mark a topic weak before any mistake", () => {
    const formula = FORMULA_CATALOG[0]!;
    const once = applyAttempt(emptyProgress(formula.id), formula.id, true);
    expect(formulaIsWeak(once)).toBe(false);
    const summary = trainerHomeSummary([once]);
    expect(summary.weakTopics).toEqual([]);
    expect(listWeakTopics([once])).toEqual(summary.weakTopics);
    expect(summary.formulaCount).toBe(FORMULA_CATALOG.length);
    expect(summary.progressLabel).toBe(`1 из ${FORMULA_CATALOG.length}`);
  });

  it("keeps a topic weak until every formula has two correct answers in a row", () => {
    const topic = FORMULA_CATALOG.filter(
      (formula) => formula.subsectionId === FORMULA_CATALOG[0]!.subsectionId
    );
    const first = topic[0]!;
    let row = applyAttempt(emptyProgress(first.id), first.id, false);
    const open = listWeakTopics([row]);
    expect(open.map((item) => item.subsectionId)).toEqual([first.subsectionId]);
    expect(trainerHomeSummary([row]).weakTopics).toEqual(open);
    expect(open[0]!.formulaCount).toBe(topic.length);

    row = applyAttempt(row, first.id, true);
    row = applyAttempt(row, first.id, true);
    expect(row.streak).toBe(2);
    expect(row.wrongCount).toBe(1);
    expect(listWeakTopics([row]).map((item) => item.subsectionId)).toEqual([
      first.subsectionId,
    ]);

    const cleared = topic.map((formula) => {
      let progress =
        formula.id === first.id
          ? row
          : applyAttempt(emptyProgress(formula.id), formula.id, true);
      if (formula.id !== first.id) {
        progress = applyAttempt(progress, formula.id, true);
      }
      return progress;
    });
    expect(listWeakTopics(cleared)).toEqual([]);
    expect(trainerHomeSummary(cleared).weakTopics).toEqual([]);

    const again = cleared.map((progress) =>
      progress.formulaId === first.id
        ? applyAttempt(progress, progress.formulaId, false)
        : progress
    );
    expect(listWeakTopics(again).map((item) => item.subsectionId)).toEqual([
      first.subsectionId,
    ]);
    expect(again[0]!.wrongCount).toBeGreaterThan(0);
  });

  it("shows no progress label before the first attempt", () => {
    expect(trainerHomeSummary([]).progressLabel).toBe("Нет данных");
  });

  it("refuses a session that the available formulas cannot fill", () => {
    expect(trainerSessionStartCheck(4, 5)).toEqual({
      ok: false,
      message: "В этом наборе 4 формулы. Выберите меньшее число вопросов.",
    });
    expect(trainerSessionStartCheck(0, 5)).toEqual({
      ok: false,
      message: "В выбранном наборе нет формул для тренировки",
    });
    expect(trainerSessionStartCheck(20, 10)).toEqual({ ok: true });
    expect(trainerSessionStartCheck(30, 7).ok).toBe(false);
  });

  it("counts only formulas of the chosen setup", () => {
    const formula = FORMULA_CATALOG[0]!;
    let progress = applyAttempt(emptyProgress(formula.id), formula.id, false);
    progress = applyAttempt(progress, formula.id, true);
    const topicSize = FORMULA_CATALOG.filter(
      (item) => item.subsectionId === formula.subsectionId
    ).length;
    expect(
      availableFormulaCount({
        tab: "custom",
        groupIds: [],
        subsectionIds: [],
        progress: [],
      })
    ).toBe(0);
    expect(
      availableFormulaCount({
        tab: "weak",
        groupIds: [],
        subsectionIds: [],
        progress: [progress],
      })
    ).toBe(topicSize);
    expect(
      availableFormulaCount({
        tab: "section",
        groupIds: ["mechanics"],
        subsectionIds: [],
        progress: [],
      })
    ).toBeGreaterThan(0);
    expect(
      availableFormulaCount({
        tab: "section",
        groupIds: [],
        subsectionIds: [],
        progress: [],
      })
    ).toBe(0);
  });

  it("toggles sections independently and unions their formulas once", () => {
    expect(toggleTrainerGroup([], "mechanics")).toEqual(["mechanics"]);
    expect(toggleTrainerGroup(["mechanics", "electricity"], "mechanics")).toEqual([
      "electricity",
    ]);
    expect(
      toggleTrainerGroup(
        ["mechanics", "mkt_thermo", "electricity", "optics_quantum"],
        "optics_quantum"
      )
    ).toEqual(["mechanics", "mkt_thermo", "electricity"]);

    const mechanics = uniqueFormulaIdsForGroups(["mechanics"]);
    const electricity = uniqueFormulaIdsForGroups(["electricity"]);
    const both = uniqueFormulaIdsForGroups(["mechanics", "electricity", "mechanics"]);
    expect(new Set(both).size).toBe(both.length);
    expect(both.length).toBe(mechanics.length + electricity.length);
    expect(both.filter((id) => mechanics.includes(id) && electricity.includes(id))).toEqual(
      []
    );
  });

  it("restores one, several and all sections without collapsing a custom subset", () => {
    const mechanics = subsectionsForGroup("mechanics");
    const electricity = subsectionsForGroup("electricity");
    expect(
      setupFromSettings({
        ...DEFAULT_TRAINER_SETTINGS,
        selectedSubsectionIds: mechanics,
        selectedGroupId: "mechanics",
      }).groupIds
    ).toEqual(["mechanics"]);
    expect(
      setupFromSettings({
        ...DEFAULT_TRAINER_SETTINGS,
        selectedSubsectionIds: [...mechanics, ...electricity],
      }).groupIds
    ).toEqual(["mechanics", "electricity"]);
    expect(
      setupFromSettings({
        ...DEFAULT_TRAINER_SETTINGS,
        selectedSubsectionIds: allSubsectionIds(),
      }).groupIds
    ).toEqual(TRAINER_GROUPS.map((group) => group.id));
    expect(
      setupFromSettings({
        ...DEFAULT_TRAINER_SETTINGS,
        selectedSubsectionIds: [mechanics[0]!],
        weakSpotsOnly: true,
      })
    ).toMatchObject({ tab: "weak", weakIds: [mechanics[0]!] });
    expect(
      setupFromSettings({
        ...DEFAULT_TRAINER_SETTINGS,
        selectedSubsectionIds: [mechanics[0]!],
      }).tab
    ).toBe("custom");
  });

  it("keeps a correct answer on screen until the learner continues", () => {
    expect(CORRECT_ANSWER_CONFIRMATION).toMatchObject({
      title: "Верно!",
      detail: "Отличная работа, продолжай.",
      autoAdvance: false,
    });
    expect(shouldRefreshAfterTrainerClose(false)).toBe(false);
    expect(shouldRefreshAfterTrainerClose(true)).toBe(true);
    const dialog = readFileSync("src/components/ui/dialog.tsx", "utf8");
    expect(dialog).toContain("top-2 right-2 z-20");
    const trainer = readFileSync(
      "src/components/formula-trainer/trainer-dialog.tsx",
      "utf8"
    );
    expect(trainer).not.toContain("z-10");
    expect(trainer).toContain("Следующий вопрос →");
    expect(trainer).toContain("Выберите хотя бы один раздел");
  });
});
