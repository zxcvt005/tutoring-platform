import {
  createPaymentOperation,
  getPaymentOperationInfo,
  readTochkaConfig,
  refundPaymentOperation,
  TOCHKA_NOT_CONFIGURED,
  type CreatePaymentOperationInput,
  type CreatePaymentOperationResult,
  type PaymentOperationInfo,
  type TochkaConfig,
} from "@/server/payments/tochka";

export type {
  CreatePaymentOperationInput,
  CreatePaymentOperationResult,
  PaymentOperationInfo,
};

export type PaymentProvider = {
  readonly id: string;
  createPaymentOperation(
    input: CreatePaymentOperationInput
  ): Promise<CreatePaymentOperationResult>;
  getPaymentOperationInfo(operationId: string): Promise<PaymentOperationInfo>;
  refundPaymentOperation(operationId: string, amount?: number): Promise<unknown>;
};

function notConfigured(): never {
  throw new Error(TOCHKA_NOT_CONFIGURED);
}

const stubProvider: PaymentProvider = {
  id: "stub",
  async createPaymentOperation() {
    return notConfigured();
  },
  async getPaymentOperationInfo() {
    return notConfigured();
  },
  async refundPaymentOperation() {
    return notConfigured();
  },
};

function tochkaProvider(cfg: TochkaConfig): PaymentProvider {
  return {
    id: "tochka",
    createPaymentOperation: (input) => createPaymentOperation(cfg, input),
    getPaymentOperationInfo: (operationId) =>
      getPaymentOperationInfo(cfg, operationId),
    refundPaymentOperation: (operationId, amount) =>
      refundPaymentOperation(cfg, operationId, amount),
  };
}

export function getPaymentProvider(): PaymentProvider {
  const forced = process.env.PAYMENT_PROVIDER?.trim();
  if (forced === "stub") return stubProvider;
  const cfg = readTochkaConfig();
  if (!cfg) return stubProvider;
  return tochkaProvider(cfg);
}

export function requirePaymentProvider(): PaymentProvider {
  const provider = getPaymentProvider();
  if (provider.id === "stub") notConfigured();
  return provider;
}