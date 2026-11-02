export const landingAverageScore = 82;

export const landingScoreYears = [
  {
    year: 2025,
    scores: [96, 92, 88, 86, 84, 84, 80, 80, 79, 77, 76, 74, 65, 61],
  },
  {
    year: 2026,
    scores: [98, 98, 96, 94, 94, 92, 90, 90, 86, 86, 84, 82, 79, 77, 74, 73, 68],
  },
] as const;

export type LandingCaseId = "alisa" | "arina" | "sonya";

export type LandingCaseCopy = {
  id: LandingCaseId;
  name: string;
  startLabel: string;
  result: number;
  paragraphs: readonly string[];
};

export const landingCases: readonly LandingCaseCopy[] = [
  {
    id: "alisa",
    name: "Алиса",
    startLabel: "около 70",
    result: 98,
    paragraphs: [
      "Пришла в январе. Последовательно разобрали все типы задач и прошли интенсивы.",
      "Основной проблемой оставались ошибки в вычислениях. На экзамене — 98 баллов и одна вычислительная ошибка.",
    ],
  },
  {
    id: "arina",
    name: "Арина",
    startLabel: "около 50",
    result: 84,
    paragraphs: [
      "Стабильно занималась и полностью выполняла задания.",
      "Последовательно прошла программу и написала экзамен на 84 балла.",
    ],
  },
  {
    id: "sonya",
    name: "Соня",
    startLabel: "с нуля",
    result: 71,
    paragraphs: [
      "Стартовала практически с нуля и сначала рассчитывала хотя бы преодолеть минимальный порог.",
      "За год прошли программу с самых основ. Итог — 71 балл.",
    ],
  },
];

/** Роль видна из самой переписки. Неразмеченный файл показывается без подписи. */
const reviewRoles: Record<string, "student" | "parent"> = {
  "review-01.jpg": "parent",
  "review-02.png": "parent",
  "review-03.jpg": "student",
  "review-04.png": "parent",
  "review-06.jpg": "parent",
  "review-07.png": "parent",
  "review-08.jpg": "student",
  "review-09.png": "parent",
  "review-11.png": "parent",
  "review-12.jpg": "student",
  "review-13.png": "parent",
  "review-14.jpg": "student",
  "review-15.jpg": "parent",
  "photo_2026-11-02_12-04-36.jpg": "student",
};

export type LandingReviewRole = "student" | "parent";

export type LandingReview = {
  id: string;
  src: string;
  role: LandingReviewRole | null;
};

export type LandingCaseMedia = LandingCaseCopy & {
  photo: string | null;
  chats: string[];
};

const IMAGE_EXT = /\.(webp|jpe?g|png)$/i;

export function publicSrc(folder: string, filename: string): string {
  return `/images/landing/${folder}/${filename}`;
}

/** `base-01`, `base-02` … Если серии нет — один файл `base`. */
export function chatSources(folder: string, files: readonly string[], base: string): string[] {
  const numbered = files
    .map((name) => {
      const match = name.match(
        new RegExp(`^${base}-(\\d+)\\.(webp|jpe?g|png)$`, "i")
      );
      return match ? { order: Number(match[1]), name } : null;
    })
    .filter((item): item is { order: number; name: string } => item !== null)
    .sort((a, b) => a.order - b.order);
  if (numbered.length > 0) {
    return numbered.map((item) => publicSrc(folder, item.name));
  }
  const single = files.find((name) =>
    new RegExp(`^${base}\\.(webp|jpe?g|png)$`, "i").test(name)
  );
  return single ? [publicSrc(folder, single)] : [];
}

export function reviewSources(
  files: readonly string[],
  roles: Record<string, LandingReviewRole> = reviewRoles
): LandingReview[] {
  const numbered = files
    .filter((name) => /^review-\d+\.(webp|jpe?g|png)$/i.test(name))
    .sort((a, b) => {
      const left = Number(a.match(/\d+/)?.[0] ?? 0);
      const right = Number(b.match(/\d+/)?.[0] ?? 0);
      return left - right;
    });
  const rest = files
    .filter(
      (name) =>
        IMAGE_EXT.test(name) && !/^review-\d+\.(webp|jpe?g|png)$/i.test(name)
    )
    .sort((a, b) => a.localeCompare(b, "ru"));
  return [...numbered, ...rest].map((name) => ({
    id: name,
    src: publicSrc("testimonials", name),
    role: roles[name] ?? null,
  }));
}

export function reviewRoleLabel(role: LandingReviewRole): string {
  return role === "parent" ? "Родитель" : "Ученик";
}
