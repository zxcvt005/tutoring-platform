import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { FORMULA_TRAINER_PRODUCT_SLUG } from "@/lib/products";
import {
  getCatalogPublic,
  getCurrentTrainerQuestion,
  getFormulaTrainerState,
  getOrCreateQuickQuestion,
  nextTrainerQuestion,
  startFormulaTraining,
  resetSectionProgress,
  submitFormulaAnswer,
  updateFormulaTrainerSettings,
} from "@/server/services/formula-trainer-service";
import { requireStudentProductAccess } from "@/server/services/products-service";

const bodySchema = z.object({
  action: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const db = getDb();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "state";

    switch (action) {
      case "state":
        return jsonOk(await getFormulaTrainerState(db, ctx));
      case "quick":
        return jsonOk(await getOrCreateQuickQuestion(db, ctx));
      case "catalog":
        await requireStudentProductAccess(
          db,
          ctx,
          FORMULA_TRAINER_PRODUCT_SLUG
        );
        return jsonOk(await getCatalogPublic());
      default:
        throw validationError(`Неизвестное действие: ${action}`);
    }
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const raw = parseBody(bodySchema, await readJsonBody(request));
    const p = (raw.payload ?? {}) as Record<string, unknown>;
    const db = getDb();

    switch (raw.action) {
      case "settings":
        return jsonOk(await updateFormulaTrainerSettings(db, ctx, p));
      case "next":
        return jsonOk(await nextTrainerQuestion(db, ctx));
      case "start":
        return jsonOk(await startFormulaTraining(db, ctx, p));
      case "current":
        return jsonOk(await getCurrentTrainerQuestion(db, ctx));
      case "answer":
        return jsonOk(await submitFormulaAnswer(db, ctx, p));
      case "reset-section":
        return jsonOk(await resetSectionProgress(db, ctx, p));
      case "refresh-quick":
        // сброс текущего quick, чтобы взять новый (после «продолжить» не обязательно)
        return jsonOk(await getOrCreateQuickQuestion(db, ctx));
      default:
        throw validationError(`Неизвестное действие: ${raw.action}`);
    }
  } catch (err) {
    return jsonError(err);
  }
}
