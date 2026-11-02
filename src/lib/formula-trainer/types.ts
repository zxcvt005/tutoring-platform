/** Типы тренажёра формул ЕГЭ по физике. */

export type FormulaSectionId =
  | "mechanics"
  | "molecular"
  | "thermodynamics"
  | "electrostatics"
  | "current"
  | "magnetism"
  | "optics"
  | "quantum";

export type FormulaSubsectionId =
  | "kinematics"
  | "rotation"
  | "dynamics"
  | "statics"
  | "conservation"
  | "oscillations"
  | "mkt"
  | "internal_energy"
  | "humidity"
  | "heat"
  | "thermo"
  | "electrostatics"
  | "capacitors"
  | "dc"
  | "series_parallel"
  | "joule"
  | "magnetism"
  | "induction"
  | "inductance"
  | "em_oscillations"
  | "thin_lens"
  | "refraction_diffraction"
  | "photon"
  | "photoeffect"
  | "radioactive";

export type MasteryStatus = "new" | "needs_review" | "mastered";

export type TrainerAnswerMode = "choice";

export type QuestionKind = "choice";

export type TrainerGroupId =
  | "mechanics"
  | "mkt_thermo"
  | "electricity"
  | "optics_quantum";

export type EquivalenceStatus =
  | "equivalent"
  | "not_equivalent"
  | "unverifiable"
  | "invalid";

export type FormulaCard = {
  id: string;
  sectionId: FormulaSectionId;
  subsectionId: FormulaSubsectionId;
  sectionTitle: string;
  subsectionTitle: string;
  title: string;
  /** Эталонная запись в DSL каталога (не LaTeX). */
  expression: string;
  /** Искомая величина / левая часть, если есть. */
  targetQuantity: string | null;
  /** Допустимые альтернативные записи (DSL). */
  acceptedForms: string[];
  /** Шаблоны правдоподобных ошибок для режима выбора. */
  distractorTemplates: string[];
  /** false — только структурное сравнение эталона, без агрессивной символьной нормализации. */
  symbolicCheck: boolean;
  notes?: string;
};

export type FormulaProgressRow = {
  formulaId: string;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  status: MasteryStatus;
  streak: number;
  lastAttemptAt: string | null;
  nextReviewAt: string | null;
};

export type TrainerSettings = {
  mode: TrainerAnswerMode;
  selectedSubsectionIds: FormulaSubsectionId[];
  selectedGroupId: TrainerGroupId | "all";
  weakSpotsOnly: boolean;
};

export type SectionStats = {
  sectionId: FormulaSectionId;
  subsectionId: FormulaSubsectionId | null;
  title: string;
  total: number;
  mastered: number;
  newer: number;
  needsReview: number;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  /** null — нет попыток («Нет данных»). */
  accuracy: number | null;
};

export type ChoiceOptionPublic = {
  id: string;
  expression: string;
};

export type TrainerQuestionPublic = {
  questionId: string;
  formulaId: string;
  title: string;
  sectionTitle: string;
  subsectionTitle: string;
  groupTitle: string;
  kind: QuestionKind;
  /** Для choice — варианты без пометки правильного. */
  options?: ChoiceOptionPublic[];
};

export type AnswerFeedback = {
  correct: boolean;
  status: EquivalenceStatus;
  correctExpression: string;
  explanation: string;
  progress: FormulaProgressRow;
};

export type QuickQuestionState = {
  question: TrainerQuestionPublic | null;
  answered: boolean;
  feedback: AnswerFeedback | null;
  selectedOptionId: string | null;
  message?: string;
};

export const MASTERY_STREAK_REQUIRED = 3;

/** Активная или только что завершённая тренировка без правильных ответов в вопросе. */
export type TrainerSessionPublic = {
  id: string;
  status: "active" | "completed";
  questionCount: number;
  /** Номер текущего вопроса, с 1. */
  index: number;
  answered: number;
  correct: number;
  question: TrainerQuestionPublic | null;
};

export const DEFAULT_TRAINER_SETTINGS: TrainerSettings = {
  mode: "choice",
  selectedSubsectionIds: [],
  selectedGroupId: "all",
  weakSpotsOnly: false,
};
