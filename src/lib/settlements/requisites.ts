import { landingRequisites } from "@/lib/landing/requisites";

/** Зафиксированные реквизиты расчётных документов (54-ФЗ п. 2.1 ст. 2). */
export const SETTLEMENT_TAX_SYSTEM = "ПСН" as const;
/** НДС отсутствует: в PDF всегда «Без НДС» (не ставка 0%). */
export const SETTLEMENT_VAT_NOTE = "Без НДС" as const;
export const SETTLEMENT_PAYMENT_FORM = "безналичными" as const;
export const SETTLEMENT_SITE_URL = "https://neodinschool.ru" as const;
export const SETTLEMENT_SETTLER_POSITION =
  "Индивидуальный предприниматель" as const;

const IP_PREFIX = /^ИП\s+/i;

/** Полное ФИО без префикса «ИП». */
export function settlementOperatorFio(
  legalName: string = landingRequisites.legalName
): string {
  return legalName.replace(IP_PREFIX, "").trim();
}

/** Фамилия из полного ФИО / legalName. */
export function settlementSettlerSurname(
  legalName: string = landingRequisites.legalName
): string {
  const fio = settlementOperatorFio(legalName);
  const surname = fio.split(/\s+/)[0]?.trim();
  if (!surname) {
    throw new Error("Не удалось извлечь фамилию ИП из реквизитов");
  }
  return surname;
}

export function settlementServiceName(
  tariffName: string,
  lessonsCount: number
): string {
  return `Покупка абонемента: ${tariffName}, ${lessonsCount} занятий`;
}

export function buildSettlementRequisiteSnapshot() {
  const legalName = landingRequisites.legalName;
  return {
    operatorLegalName: legalName,
    operatorFio: settlementOperatorFio(legalName),
    inn: landingRequisites.inn,
    ogrnip: landingRequisites.ogrnip,
    taxSystem: SETTLEMENT_TAX_SYSTEM,
    vatNote: SETTLEMENT_VAT_NOTE,
    paymentForm: SETTLEMENT_PAYMENT_FORM,
    siteUrl: SETTLEMENT_SITE_URL,
    settlerPosition: SETTLEMENT_SETTLER_POSITION,
    settlerSurname: settlementSettlerSurname(legalName),
  } as const;
}
