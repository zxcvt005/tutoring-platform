import { eq } from "drizzle-orm";

import type { LibraryScope, MaterialOrigin } from "@/lib/types";
import { materialOrigins } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export function originKey(kind: string, materialId: string) {
  return `${kind}:${materialId}`;
}

export async function loadOriginMap(
  db: AppDb,
  organizationId: string
): Promise<Map<string, MaterialOrigin>> {
  const rows = await db
    .select()
    .from(materialOrigins)
    .where(eq(materialOrigins.organizationId, organizationId));
  const map = new Map<string, MaterialOrigin>();
  for (const row of rows) {
    map.set(originKey(row.materialKind, row.materialId), {
      sourceKind: row.sourceKind as MaterialOrigin["sourceKind"],
      sourceId: row.sourceId,
      sourceTitle: row.sourceTitle,
      sourceAuthorName: row.sourceAuthorName,
      sourceVersionId: row.sourceVersionId,
      sourceScope: row.sourceScope as LibraryScope,
      copiedAt: row.copiedAt.toISOString(),
    });
  }
  return map;
}
