/** Стабильный машинный идентификатор тренажёра формул. Не зависит от названия. */
export const FORMULA_TRAINER_PRODUCT_SLUG = "physics-ege-formula-trainer";

export const FORMULA_TRAINER_PRODUCT_NAME =
  "Тренажёр формул по физике ЕГЭ";

export const FORMULA_TRAINER_PRODUCT_DESCRIPTION =
  "Интерактивный тренажёр для запоминания и повторения формул физики в рамках подготовки к ЕГЭ.";

/**
 * Продукты, у которых есть реализованная функциональность в коде.
 * Запись в каталоге без slug из этого множества ученикам не показывается.
 */
export const IMPLEMENTED_PRODUCT_SLUGS = new Set<string>([
  FORMULA_TRAINER_PRODUCT_SLUG,
]);

export function isImplementedProductSlug(slug: string): boolean {
  return IMPLEMENTED_PRODUCT_SLUGS.has(slug);
}

export function defaultProductId(organizationId: string, slug: string): string {
  return `prd_${organizationId}_${slug.replace(/-/g, "_")}`;
}

const RU_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Стабильный slug из названия. После создания продукта slug больше не меняется. */
export function slugifyProductName(name: string): string {
  const mapped = [...name.trim().toLowerCase()]
    .map((ch) => RU_TO_LATIN[ch] ?? ch)
    .join("");
  const slug = mapped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "product";
}
