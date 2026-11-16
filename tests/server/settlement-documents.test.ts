import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { payments, settlementDocuments } from "@/server/db/schema";
import { setChatObjectStoreForTests } from "@/server/media/chat-storage";
import { loginWithPassword } from "@/server/services/auth-service";
import { confirmPaidFromBank } from "@/server/services/lesson-orders-service";
import { getSettlementPdf } from "@/server/media/settlement-storage";
import { renderSettlementPdf } from "@/server/settlements/render-settlement-pdf";
import {
  ensureIncomeReturnSettlementDocument,
  ensureIncomeSettlementDocument,
  getSettlementDocumentForDownload,
} from "@/server/services/settlement-documents-service";
import {
  physicsDirectionId,
  seedPaidLessons,
} from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

/**
 * Тело PDF (CID/Identity-H) не хранит кириллицу plain-text;
 * метаданные pdfkit (Keywords/Subject) — UTF-16BE.
 */
function pdfContainsText(bytes: Buffer, text: string): boolean {
  if (bytes.includes(Buffer.from(text, "utf8"))) return true;
  const utf16be = Buffer.from(text, "utf16le").swap16();
  return bytes.includes(utf16be);
}

function expectVatBezNds(note: string, pdf: Buffer) {
  expect(note).toBe("Без НДС");
  expect(note).not.toMatch(/0\s*%/);
  expect(pdfContainsText(pdf, "Без НДС")).toBe(true);
  // Только формулировка в Keywords, не сырой «0%» по всему бинарнику (ложные совпадения).
  expect(pdfContainsText(pdf, "НДС: Без НДС")).toBe(true);
  expect(pdfContainsText(pdf, "НДС: 0%")).toBe(false);
}

describe("settlement documents", () => {
  let close: (() => Promise<void>) | undefined;
  let uploadRoot: string | undefined;
  let previousUploadRoot: string | undefined;
  let previousDriver: string | undefined;

  beforeEach(async () => {
    previousUploadRoot = process.env.CHAT_UPLOAD_ROOT;
    previousDriver = process.env.CHAT_STORAGE_DRIVER;
    uploadRoot = await mkdtemp(path.join(tmpdir(), "settlement-pdf-"));
    process.env.CHAT_UPLOAD_ROOT = uploadRoot;
    process.env.CHAT_STORAGE_DRIVER = "local";
    setChatObjectStoreForTests(null);
  });

  afterEach(async () => {
    if (close) await close();
    close = undefined;
    setChatObjectStoreForTests(null);
    if (previousUploadRoot === undefined) delete process.env.CHAT_UPLOAD_ROOT;
    else process.env.CHAT_UPLOAD_ROOT = previousUploadRoot;
    if (previousDriver === undefined) delete process.env.CHAT_STORAGE_DRIVER;
    else process.env.CHAT_STORAGE_DRIVER = previousDriver;
    if (uploadRoot) {
      await rm(uploadRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  async function asRole(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("creates income PDF on confirmPaid and stays idempotent on replay", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);

    const seeded = await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 4,
      tariffName: "Интенсив PDF",
      totalPrice: 4000,
    });

    const docs = await t.db
      .select()
      .from(settlementDocuments)
      .where(eq(settlementDocuments.paymentId, seeded.paymentId));
    expect(docs).toHaveLength(1);
    expect(docs[0]?.kind).toBe("income");
    expect(docs[0]?.sequentialNumber).toBe(1);
    expect(docs[0]?.settlementSign).toBe("приход");
    expect(docs[0]?.taxSystemSnapshot).toBe("ПСН");
    expect(docs[0]?.settlerSurnameSnapshot).toBe("Гусын");
    expect(docs[0]?.serviceNameSnapshot).toBe(
      "Покупка абонемента: Интенсив PDF, 4 занятий"
    );
    expect(docs[0]?.siteUrlSnapshot).toBe("https://neodinschool.ru");

    const incomePdf = await getSettlementPdf(docs[0]!.pdfStorageKey);
    expectVatBezNds(docs[0]!.vatNote, incomePdf);

    const replay = await confirmPaidFromBank(t.db, director, {
      paymentId: seeded.paymentId,
      amount: seeded.totalAmount,
    });
    expect(replay.alreadyPaid).toBe(true);

    const afterReplay = await t.db
      .select()
      .from(settlementDocuments)
      .where(eq(settlementDocuments.paymentId, seeded.paymentId));
    expect(afterReplay).toHaveLength(1);
    expect(afterReplay[0]?.id).toBe(docs[0]?.id);
    expect(afterReplay[0]?.pdfSha256).toBe(docs[0]?.pdfSha256);

    const again = await ensureIncomeSettlementDocument(t.db, {
      paymentId: seeded.paymentId,
      organizationId: director.organizationId,
    });
    expect(again.id).toBe(docs[0]?.id);

    const student = await asRole(t.db, "s11@demo.local");
    const file = await getSettlementDocumentForDownload(
      t.db,
      student,
      docs[0]!.id
    );
    expect(file.bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(file.fileName).toContain("prihod-1");
  });

  it("creates sequential return document after full refund status", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);

    const first = await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 2,
      tariffName: "А",
      totalPrice: 2000,
    });
    const second = await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 3,
      tariffName: "Б",
      totalPrice: 3000,
    });

    const incomeDocs = await t.db
      .select()
      .from(settlementDocuments)
      .where(eq(settlementDocuments.kind, "income"));
    expect(incomeDocs.map((d) => d.sequentialNumber).sort()).toEqual([1, 2]);

    await t.db
      .update(payments)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(payments.id, first.paymentId));

    const ret = await ensureIncomeReturnSettlementDocument(t.db, {
      paymentId: first.paymentId,
      organizationId: director.organizationId,
    });
    expect(ret.kind).toBe("income_return");
    expect(ret.sequentialNumber).toBe(3);
    expect(ret.settlementSign).toBe("возврат прихода");
    expect(ret.originalDocumentId).toBeTruthy();
    const returnPdf = await getSettlementPdf(ret.pdfStorageKey);
    expectVatBezNds(ret.vatNote, returnPdf);
    expect(pdfContainsText(returnPdf, "возврат прихода")).toBe(true);

    const retAgain = await ensureIncomeReturnSettlementDocument(t.db, {
      paymentId: first.paymentId,
      organizationId: director.organizationId,
    });
    expect(retAgain.id).toBe(ret.id);

    const forPayment = await t.db
      .select()
      .from(settlementDocuments)
      .where(
        and(
          eq(settlementDocuments.paymentId, first.paymentId),
          eq(settlementDocuments.kind, "income_return")
        )
      );
    expect(forPayment).toHaveLength(1);

    const secondDocs = await t.db
      .select()
      .from(settlementDocuments)
      .where(eq(settlementDocuments.paymentId, second.paymentId));
    expect(secondDocs).toHaveLength(1);
    expect(secondDocs[0]?.kind).toBe("income");
  });

  it("renderSettlementPdf embeds Без НДС for both settlement signs", async () => {
    const base = {
      documentTitle: "Документ, подтверждающий расчёт",
      sequentialNumber: 1,
      issuedAt: new Date("2026-01-15T10:00:00+05:00"),
      operatorLegalName: "ИП Гусын Анатолий Владимирович",
      operatorFio: "Гусын Анатолий Владимирович",
      inn: "744515573967",
      ogrnip: "326745600118741",
      taxSystem: "ПСН",
      siteUrl: "https://neodinschool.ru",
      serviceName: "Покупка абонемента: Тест, 2 занятий",
      amount: 2000,
      currency: "RUB",
      vatNote: "Без НДС",
      paymentForm: "безналичными",
      settlerPosition: "Индивидуальный предприниматель",
      settlerSurname: "Гусын",
    } as const;

    const income = await renderSettlementPdf({
      ...base,
      settlementSign: "приход",
    });
    const ret = await renderSettlementPdf({
      ...base,
      sequentialNumber: 2,
      settlementSign: "возврат прихода",
      originalSequentialNumber: 1,
    });

    expectVatBezNds("Без НДС", income.bytes);
    expectVatBezNds("Без НДС", ret.bytes);
  });

  it("forbids teacher from downloading settlement PDF", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    const seeded = await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 1,
      tariffName: "Доступ",
    });
    const [doc] = await t.db
      .select()
      .from(settlementDocuments)
      .where(eq(settlementDocuments.paymentId, seeded.paymentId));
    expect(doc).toBeTruthy();

    const teacher = await asRole(t.db, "anna@example.com");
    await expect(
      getSettlementDocumentForDownload(t.db, teacher, doc!.id)
    ).rejects.toMatchObject({ status: 403 });
  });
});
