export const QUICK_ACCESS_TYPES = [
  "baza",
  "rnp-avito",
  "probnye-uroki",
  "rashody",
] as const;

export type QuickAccessType = (typeof QUICK_ACCESS_TYPES)[number];

export const QUICK_ACCESS_LABELS: Record<QuickAccessType, string> = {
  baza: "База",
  "rnp-avito": "РНП Авито",
  "probnye-uroki": "Пробные уроки",
  rashody: "Расходы",
};

export const QUICK_ACCESS_ACTIONS: Record<
  QuickAccessType,
  readonly string[]
> = {
  baza: [
    "listBaseLeads",
    "createBaseLead",
    "updateBaseLead",
    "deleteBaseLead",
  ],
  "rnp-avito": [
    "getRnpAvitoMonth",
    "upsertRnpAvitoManualDay",
    "clearRnpAvitoTrialOverride",
    "syncRnpAvitoMonth",
  ],
  "probnye-uroki": [
    "listManualTrialLessons",
    "createManualTrialLesson",
    "updateManualTrialLesson",
    "deleteManualTrialLesson",
  ],
  rashody: [
    "listExpenses",
    "createManualExpense",
    "updateManualExpense",
    "deleteManualExpense",
  ],
};

export function isQuickAccessType(value: string): value is QuickAccessType {
  return (QUICK_ACCESS_TYPES as readonly string[]).includes(value);
}

export function quickAccessPath(
  accessType: QuickAccessType,
  rawToken: string
): string {
  return `/quick-access/${accessType}/${rawToken}`;
}

export type QuickAccessLinkView = {
  accessType: QuickAccessType;
  label: string;
  exists: boolean;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  disabledAt: string | null;
  lastUsedAt: string | null;
};

export type QuickAccessIssuedLink = {
  accessType: QuickAccessType;
  label: string;
  url: string;
  path: string;
  token: string;
  enabled: true;
  createdAt: string;
};
