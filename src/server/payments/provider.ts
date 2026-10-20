/**
 * Абстракция платёжного провайдера.
 * Реальная интеграция с Точка Банком подключается позже без смены бизнес-логики.
 */

export type CreatePaymentIntentInput = {
  paymentId: string;
  amount: number;
  currency: "RUB";
  description: string;
  returnUrl?: string;
};

export type CreatePaymentIntentResult = {
  /** URL для редиректа; null — провайдер ещё не настроен */
  checkoutUrl: string | null;
  externalId: string | null;
  provider: string;
  message?: string;
};

export type PaymentProvider = {
  readonly id: string;
  createPaymentIntent(
    input: CreatePaymentIntentInput
  ): Promise<CreatePaymentIntentResult>;
};

/** Заглушка до подключения Точка Банка / СБП. */
export const stubPaymentProvider: PaymentProvider = {
  id: "stub",
  async createPaymentIntent() {
    return {
      checkoutUrl: null,
      externalId: null,
      provider: "stub",
      message: "Оплата скоро появится",
    };
  },
};

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER?.trim() || "stub";
  if (name === "stub") return stubPaymentProvider;
  // Будущие провайдеры: tochka и т.п.
  return stubPaymentProvider;
}
