import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import {
  getPressFeedback,
  getTeacherFeedback,
  listPressFeedback,
  listTeacherFeedback,
  markPressFeedbackParentSent,
  markPressFeedbackProcessed,
  savePressParentText,
  saveTeacherFeedbackDraft,
  startPressFeedback,
  submitTeacherFeedback,
} from "@/server/services/monthly-feedback-service";

const bodySchema = z.object({
  action: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function str(v: unknown): string {
  return String(v ?? "");
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "1";
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const db = getDb();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "";
    const year = url.searchParams.get("year") ?? undefined;
    const month = url.searchParams.get("month") ?? undefined;
    const period = url.searchParams.get("period") ?? undefined;

    switch (action) {
      case "teacherList":
        return jsonOk(
          await listTeacherFeedback(db, ctx, { year, month, period })
        );
      case "teacherReport":
        return jsonOk(
          await getTeacherFeedback(db, ctx, {
            studentId: str(url.searchParams.get("studentId")),
            year,
            month,
            period,
          })
        );
      case "pressList":
        return jsonOk(
          await listPressFeedback(db, ctx, {
            year,
            month,
            period,
            status: url.searchParams.get("status") ?? "all",
          })
        );
      case "pressReport":
        return jsonOk(
          await getPressFeedback(db, ctx, str(url.searchParams.get("id")))
        );
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
      case "saveDraft":
        return jsonOk(await saveTeacherFeedbackDraft(db, ctx, p as never));
      case "submit":
        return jsonOk(await submitTeacherFeedback(db, ctx, p as never));
      case "pressStart":
        return jsonOk(await startPressFeedback(db, ctx, str(p.id)));
      case "pressSaveText":
        return jsonOk(
          await savePressParentText(db, ctx, str(p.id), p.parentMessageText)
        );
      case "pressMarkProcessed":
        return jsonOk(await markPressFeedbackProcessed(db, ctx, str(p.id)));
      case "pressMarkParentSent":
        return jsonOk(
          await markPressFeedbackParentSent(db, ctx, str(p.id), bool(p.sent))
        );
      default:
        throw validationError(`Неизвестное действие: ${raw.action}`);
    }
  } catch (err) {
    return jsonError(err);
  }
}
