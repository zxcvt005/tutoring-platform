import { and, eq } from "drizzle-orm";

import { FORMULA_TRAINER_PRODUCT_SLUG } from "@/lib/products";
import { lessonOrders } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { ensureDefaultProducts } from "@/server/services/products-service";

/** Adds formula trainer to the student's paid order product snapshot (commerce model). */
export async function grantFormulaTrainerOnTariff(
  db: AppDb,
  organizationId: string,
  studentId = "s1"
) {
  const product = await ensureDefaultProducts(db, organizationId);
  await db
    .update(lessonOrders)
    .set({
      productIdsSnapshot: [product.id],
      updatedAt: new Date(),
    })
  .where(
      and(
        eq(lessonOrders.organizationId, organizationId),
        eq(lessonOrders.studentId, studentId),
        eq(lessonOrders.status, "paid")
      )
    );
  return product;
}

export { FORMULA_TRAINER_PRODUCT_SLUG };