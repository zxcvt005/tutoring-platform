import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { FORMULA_CATALOG } from "@/lib/formula-trainer/catalog";
import { FORMULA_TRAINER_PRODUCT_SLUG } from "@/lib/products";
import { resolveAuthContext } from "@/server/authz/context";
import {
  formulaTrainerProgress,
  lessonOrders,
  products,
  tariffProducts,
  tariffs,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  getOrCreateQuickQuestion,
  submitFormulaAnswer,
} from "@/server/services/formula-trainer-service";
import {
  ensureDefaultProducts,
  listProducts,
  studentHasProductAccess,
  upsertProduct,
} from "@/server/services/products-service";
import { upsertTariff } from "@/server/services/tariffs-service";
import { physicsDirectionId, seedPaidLessons } from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("products catalog and access", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
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

  it("creates the first product once and does not duplicate on re-init", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const first = await ensureDefaultProducts(t.db, director.organizationId);
    expect(first.slug).toBe(FORMULA_TRAINER_PRODUCT_SLUG);
    expect(first.name).toBe("Тренажёр формул по физике ЕГЭ");
    expect(first.isActive).toBe(true);

    const listed = await listProducts(t.db, director);
    expect(
      listed.filter((p) => p.slug === FORMULA_TRAINER_PRODUCT_SLUG)
    ).toHaveLength(1);

    await ensureDefaultProducts(t.db, director.organizationId);
    await ensureDefaultProducts(t.db, director.organizationId);

    const rows = await t.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.organizationId, director.organizationId),
          eq(products.slug, FORMULA_TRAINER_PRODUCT_SLUG)
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first.id);
  });

  it("allows editing name/description and deactivating a product", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const product = await ensureDefaultProducts(t.db, director.organizationId);

    await upsertProduct(t.db, director, {
      id: product.id,
      name: "Тренажёр формул (обновлённый)",
      description: "Новое описание",
      isActive: false,
    });

    const listed = await listProducts(t.db, director);
    const row = listed.find((p) => p.id === product.id);
    expect(row?.name).toBe("Тренажёр формул (обновлённый)");
    expect(row?.description).toBe("Новое описание");
    expect(row?.isActive).toBe(false);
    expect(row?.slug).toBe(FORMULA_TRAINER_PRODUCT_SLUG);
  });

  it("attaches a product to tariffs without duplicates or price changes", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const trainer = await ensureDefaultProducts(t.db, director.organizationId);
    const extra = await upsertProduct(t.db, director, {
      name: "Каталожный сервис",
      description: "Без реализации",
    });

    const [standard] = await t.db
      .select()
      .from(tariffs)
      .where(eq(tariffs.id, "tariff_standard"))
      .limit(1);
    const originalName = standard!.name;

    await upsertTariff(t.db, director, {
      id: "tariff_standard",
      directionId: standard!.directionId,
      name: standard!.name,
      includesText: standard!.includesText ?? undefined,
      features: (standard!.features ?? []) as string[],
      status: "active",
      productIds: [trainer.id],
    });
    await upsertTariff(t.db, director, {
      id: "tariff_standard",
      directionId: standard!.directionId,
      name: standard!.name,
      includesText: standard!.includesText ?? undefined,
      features: (standard!.features ?? []) as string[],
      status: "active",
      productIds: [trainer.id],
    });

    const standardLinks = await t.db
      .select()
      .from(tariffProducts)
      .where(eq(tariffProducts.tariffId, "tariff_standard"));
    expect(standardLinks).toHaveLength(1);

    const [after] = await t.db
      .select()
      .from(tariffs)
      .where(eq(tariffs.id, "tariff_standard"))
      .limit(1);
    expect(after!.name).toBe(originalName);

    const [basicTariff] = await t.db
      .select()
      .from(tariffs)
      .where(eq(tariffs.id, "tariff_basic"))
      .limit(1);
    const [intensiveTariff] = await t.db
      .select()
      .from(tariffs)
      .where(eq(tariffs.id, "tariff_intensive"))
      .limit(1);

    await upsertTariff(t.db, director, {
      id: "tariff_basic",
      directionId: basicTariff!.directionId,
      name: basicTariff!.name,
      productIds: [trainer.id, extra.id],
    });
    await upsertTariff(t.db, director, {
      id: "tariff_intensive",
      directionId: intensiveTariff!.directionId,
      name: intensiveTariff!.name,
      productIds: [trainer.id],
    });

    const trainerLinks = await t.db
      .select()
      .from(tariffProducts)
      .where(eq(tariffProducts.productId, trainer.id));
    expect(trainerLinks.map((l) => l.tariffId).sort()).toEqual([
      "tariff_basic",
      "tariff_intensive",
      "tariff_standard",
    ]);

    const basicLinks = await t.db
      .select()
      .from(tariffProducts)
      .where(eq(tariffProducts.tariffId, "tariff_basic"));
    expect(basicLinks).toHaveLength(2);
  });

  it("computes student access from paid order snapshot and product status", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const student = await asRole(t.db, "s1@demo.local");
    const other = await asRole(t.db, "s2@demo.local");
    const trainer = await ensureDefaultProducts(t.db, director.organizationId);
    const directionId = await physicsDirectionId(t.db, director.organizationId);

    expect(
      await studentHasProductAccess(t.db, student, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(false);
    expect(
      await studentHasProductAccess(t.db, other, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(false);

    const purchased = await seedPaidLessons(t.db, director, "s1", {
      directionId,
      lessons: 8,
      productIds: [trainer.id],
      tariffName: "С тренажёром",
      tariffId: "tar_products_access",
    });
    expect(
      await studentHasProductAccess(t.db, student, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(true);
    expect(
      await studentHasProductAccess(t.db, other, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(false);

    const quick = await getOrCreateQuickQuestion(t.db, student);
    expect(quick.question).not.toBeNull();
    const optionId = quick.question!.options![0]!.id;
    await submitFormulaAnswer(t.db, student, {
      questionId: quick.question!.questionId,
      selectedOptionId: optionId,
    });
    const progressBefore = await t.db
      .select()
      .from(formulaTrainerProgress)
      .where(eq(formulaTrainerProgress.studentId, student.studentId!));
    expect(progressBefore.length).toBeGreaterThan(0);

    await t.db
      .update(lessonOrders)
      .set({ productIdsSnapshot: [], updatedAt: new Date() })
      .where(eq(lessonOrders.id, purchased.orderId));
    expect(
      await studentHasProductAccess(t.db, student, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(false);
    await expect(getOrCreateQuickQuestion(t.db, student)).rejects.toThrow(
      /недоступен/i
    );

    const progressAfterRevoke = await t.db
      .select()
      .from(formulaTrainerProgress)
      .where(eq(formulaTrainerProgress.studentId, student.studentId!));
    expect(progressAfterRevoke).toHaveLength(progressBefore.length);

    await t.db
      .update(lessonOrders)
      .set({ productIdsSnapshot: [trainer.id], updatedAt: new Date() })
      .where(eq(lessonOrders.id, purchased.orderId));
    expect(
      await studentHasProductAccess(t.db, student, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(true);

    await t.db
      .update(lessonOrders)
      .set({ accessRevoked: true, updatedAt: new Date() })
      .where(eq(lessonOrders.id, purchased.orderId));
    expect(
      await studentHasProductAccess(t.db, student, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(false);

    await t.db
      .update(lessonOrders)
      .set({ accessRevoked: false, updatedAt: new Date() })
      .where(eq(lessonOrders.id, purchased.orderId));
    expect(
      await studentHasProductAccess(t.db, student, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(true);

    await upsertProduct(t.db, director, {
      id: trainer.id,
      name: trainer.name,
      description: trainer.description,
      isActive: false,
    });
    expect(
      await studentHasProductAccess(t.db, student, FORMULA_TRAINER_PRODUCT_SLUG)
    ).toBe(false);
  });

  it("does not grant access to a catalog-only product without implementation", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const student = await asRole(t.db, "s1@demo.local");
    const extra = await upsertProduct(t.db, director, {
      name: "Будущий тренажёр",
      description: "Пока только в каталоге",
    });
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    await seedPaidLessons(t.db, director, "s1", {
      directionId,
      lessons: 4,
      productIds: [extra.id],
      tariffId: "tar_catalog_only",
    });

    const catalog = await listProducts(t.db, director);
    const row = catalog.find((p) => p.id === extra.id);
    expect(row?.implemented).toBe(false);
    expect(await studentHasProductAccess(t.db, student, row!.slug)).toBe(false);
  });

  it("keeps formula catalog identifiers unchanged", () => {
    expect(FORMULA_CATALOG.length).toBeGreaterThan(10);
    expect(FORMULA_CATALOG.every((f) => typeof f.id === "string" && f.id)).toBe(
      true
    );
    const ids = FORMULA_CATALOG.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
