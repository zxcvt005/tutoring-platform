import { FORMULA_TRAINER_PRODUCT_SLUG } from "@/lib/products";
import { tariffProducts } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { ensureDefaultProducts } from "@/server/services/products-service";

export async function grantFormulaTrainerOnTariff(
  db: AppDb,
  organizationId: string,
  tariffId: string
) {
  const product = await ensureDefaultProducts(db, organizationId);
  await db
    .insert(tariffProducts)
    .values({
      tariffId,
      productId: product.id,
      organizationId,
    })
    .onConflictDoNothing();
  return product;
}

export { FORMULA_TRAINER_PRODUCT_SLUG };
