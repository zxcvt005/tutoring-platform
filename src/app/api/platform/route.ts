import { z } from "zod";

import type { StudentAnswer } from "@/lib/types";
import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import { withIdempotency } from "@/server/idempotency";
import {
  getIdempotencyKey,
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import * as m from "@/server/services/platform-mutations";

const bodySchema = z.object({
  action: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const raw = parseBody(bodySchema, await readJsonBody(request));
    const p = (raw.payload ?? {}) as Record<string, unknown>;
    const db = getDb();

    const run = async () => {
      switch (raw.action) {
        case "upsertTeacher":
          return m.upsertTeacher(db, ctx, p as never);
        case "deleteTeacher":
          return m.deleteTeacher(db, ctx, String(p.id));
        case "upsertStudent":
          return m.upsertStudent(db, ctx, p as never);
        case "deleteStudent":
          return m.deleteStudent(db, ctx, String(p.id));
        case "upsertLesson":
          return m.upsertLesson(db, ctx, p as never);
        case "createRecurringSchedule":
          return m.createRecurringScheduleAction(db, ctx, p);
        case "deleteLesson":
          return m.deleteLesson(db, ctx, String(p.id));
        case "completeLesson":
          return m.completeLesson(db, ctx, p as never);
        case "setAttendance":
          return m.setAttendance(
            db,
            ctx,
            String(p.lessonId),
            String(p.studentId),
            p.status as never
          );
        case "setLessonTopic":
          return m.setLessonTopic(db, ctx, {
            lessonId: String(p.lessonId),
            topicId: (p.topicId as string | null | undefined) ?? null,
            title: (p.title as string | null | undefined) ?? null,
          });
        case "setLessonTopics":
          return m.setLessonTopics(db, ctx, {
            lessonId: String(p.lessonId),
            topics: (p.topics as { topicId?: string | null; title?: string | null }[]) ?? [],
          });
        case "upsertTopicSection":
          return m.upsertTopicSection(db, ctx, p as never);
        case "deleteTopicSection":
          return m.deleteTopicSection(
            db,
            ctx,
            String(p.id),
            (p.moveTopicsTo as string | null) ?? null
          );
        case "reorderTopicSections":
          return m.reorderTopicSections(
            db,
            ctx,
            String(p.teacherId),
            p.orderedIds as string[]
          );
        case "upsertTopic":
          return m.upsertTopic(db, ctx, p as never);
        case "deleteTopic":
          return m.deleteTopic(db, ctx, String(p.id));
        case "moveTopic":
          return m.moveTopic(
            db,
            ctx,
            String(p.topicId),
            (p.sectionId as string | null) ?? null,
            p.sortOrder as number | undefined
          );
        case "reorderTopics":
          return m.reorderTopics(
            db,
            ctx,
            String(p.teacherId),
            (p.sectionId as string | null) ?? null,
            p.orderedIds as string[]
          );
        case "upsertHomework":
          return m.upsertHomework(db, ctx, p as never);
        case "deleteHomework":
          return m.deleteHomework(db, ctx, String(p.id));
        case "publishHomework":
          return m.publishHomework(db, ctx, String(p.id));
        case "assignHomework":
          return m.assignHomework(db, ctx, p as never);
        case "deleteHomeworkAssignment":
          return m.deleteHomeworkAssignment(db, ctx, String(p.id));
        case "saveHomeworkDraft":
          return m.saveHomeworkDraftAction(
            db,
            ctx,
            String(p.id),
            p.answers as StudentAnswer[],
            p.attemptNumber === 2 ? 2 : 1
          );
        case "submitHomeworkAssignment":
          return m.submitHomeworkAction(
            db,
            ctx,
            String(p.id),
            p.answers as StudentAnswer[],
            p.attemptNumber === 2 ? 2 : 1
          );
        case "reviewHomeworkAssignment":
          return m.reviewHomeworkAction(
            db,
            ctx,
            String(p.id),
            p.updates as never,
            p.overallFeedback as string | undefined
          );
        case "upsertTariff":
          return m.upsertTariffAction(db, ctx, p);
        case "archiveTariff":
          return m.archiveTariffAction(db, ctx, String(p.id));
        case "assignTariff":
          return m.assignTariffAction(db, ctx, p);
        case "adminMarkPaymentPaid":
          return m.adminMarkPaidAction(db, ctx, p);
        case "studentRequestPayment":
          return m.studentPayAction(db, ctx, String(p.assignmentId));
        case "getIncomeOverview":
          return m.getIncomeOverviewAction(db, ctx);
        case "upsertTheory":
          return m.upsertTheoryAction(db, ctx, p);
        case "deleteTheory":
          return m.deleteTheoryAction(db, ctx, String(p.id));
        case "assignTheory":
          return m.assignTheoryAction(db, ctx, p);
        case "markTheoryViewed":
          return m.markTheoryViewedAction(db, ctx, String(p.id));
        case "removeTheoryFile":
          return m.removeTheoryFileAction(
            db,
            ctx,
            String(p.materialId),
            String(p.fileId)
          );
        default:
          throw validationError(`Неизвестное действие: ${raw.action}`);
      }
    };

    const idempotent = new Set([
      "submitHomeworkAssignment",
      "reviewHomeworkAssignment",
      "assignHomework",
      "assignTheory",
      "markTheoryViewed",
      "completeLesson",
      "studentRequestPayment",
      "assignTariff",
    ]);

    if (idempotent.has(raw.action)) {
      const out = await withIdempotency(
        db,
        ctx,
        `POST:/api/platform:${raw.action}`,
        getIdempotencyKey(request),
        async () => {
          const body = await run();
          return { status: 200, body };
        }
      );
      return jsonOk(out.body);
    }

    return jsonOk(await run());
  } catch (err) {
    return jsonError(err);
  }
}
