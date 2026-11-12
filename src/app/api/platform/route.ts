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
import {
  createMockExam,
  deleteMockExam,
  setMockExamResult,
  updateMockExam,
} from "@/server/services/mock-exams-service";
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
        case "archiveStudent":
          return m.archiveStudent(db, ctx, {
            id: String(p.id),
            reason: p.reason as never,
            comment: (p.comment as string | null | undefined) ?? null,
          });
        case "restoreStudent":
          return m.restoreStudent(db, ctx, String(p.id));
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
        case "resetLessonConduct":
          return m.resetLessonConductAction(db, ctx, p);
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
        case "upsertMaterialFolder": {
          const {
            upsertMaterialFolder,
          } = await import("@/server/services/folder-service");
          return upsertMaterialFolder(db, ctx, {
            id: p.id as string | undefined,
            title: String(p.title ?? ""),
            parentId: (p.parentId as string | null | undefined) ?? null,
            ownerScope:
              p.ownerScope === "school" ? "school" : "teacher",
            teacherId: (p.teacherId as string | null | undefined) ?? null,
            sortOrder: p.sortOrder as number | undefined,
            contentKind:
              p.contentKind === "topic" ||
              p.contentKind === "theory" ||
              p.contentKind === "test" ||
              p.contentKind === "intensive" ||
              p.contentKind === "shared"
                ? p.contentKind
                : p.contentKind === null
                  ? null
                  : undefined,
          });
        }
        case "deleteMaterialFolder": {
          const {
            deleteMaterialFolder,
          } = await import("@/server/services/folder-service");
          return deleteMaterialFolder(
            db,
            ctx,
            String(p.id),
            p.mode === "empty_only" ? "empty_only" : "move_to_parent"
          );
        }
        case "moveMaterialFolder": {
          const {
            moveMaterialFolder,
          } = await import("@/server/services/folder-service");
          return moveMaterialFolder(
            db,
            ctx,
            String(p.folderId),
            (p.targetParentId as string | null) ?? null
          );
        }
        case "reorderMaterialFolders": {
          const {
            reorderMaterialFolders,
          } = await import("@/server/services/folder-service");
          return reorderMaterialFolders(
            db,
            ctx,
            {
              ownerScope:
                p.ownerScope === "school" ? "school" : "teacher",
              teacherId: (p.teacherId as string | null | undefined) ?? null,
            },
            (p.parentId as string | null) ?? null,
            (p.orderedIds as string[]) ?? []
          );
        }
        case "moveMaterialToFolder": {
          const {
            moveMaterialToFolder,
          } = await import("@/server/services/folder-service");
          const kind = String(p.kind);
          if (
            kind !== "topic" &&
            kind !== "test" &&
            kind !== "theory" &&
            kind !== "intensive"
          ) {
            throw validationError("Неизвестный тип материала");
          }
          return moveMaterialToFolder(
            db,
            ctx,
            { kind, id: String(p.id) },
            (p.folderId as string | null) ?? null
          );
        }
        case "upsertHomework":
          return m.upsertHomework(db, ctx, p as never);
        case "deleteHomework":
          return m.deleteHomework(db, ctx, String(p.id));
        case "restoreHomework":
          return m.restoreHomework(db, ctx, String(p.id));
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
        case "listProducts":
          return m.listProductsAction(db, ctx);
        case "upsertProduct":
          return m.upsertProductAction(db, ctx, p);
        case "listBaseLeads":
          return m.listBaseLeadsAction(db, ctx);
        case "createBaseLead":
          return m.createBaseLeadAction(db, ctx);
        case "updateBaseLead":
          return m.updateBaseLeadAction(db, ctx, p);
        case "deleteBaseLead":
          return m.deleteBaseLeadAction(db, ctx, p);
        case "listManualTrialLessons":
          return m.listManualTrialLessonsAction(db, ctx);
        case "createManualTrialLesson":
          return m.createManualTrialLessonAction(db, ctx);
        case "updateManualTrialLesson":
          return m.updateManualTrialLessonAction(db, ctx, p);
        case "deleteManualTrialLesson":
          return m.deleteManualTrialLessonAction(db, ctx, p);
        case "getRnpAvitoMonth":
          return m.getRnpAvitoMonthAction(db, ctx, p);
        case "upsertRnpAvitoManualDay":
          return m.upsertRnpAvitoManualDayAction(db, ctx, p);
        case "syncRnpAvitoMonth":
          return m.syncRnpAvitoMonthAction(db, ctx, p);
        case "archiveTariff":
          return m.archiveTariffAction(db, ctx, String(p.id));
        case "assignTariff":
          return m.assignTariffAction(db, ctx, p);
        case "setStudentPurchaseTariff":
          return m.setStudentPurchaseTariffAction(db, ctx, p);
        case "adminMarkPaymentPaid":
          return m.adminMarkPaidAction(db, ctx, p);
        case "adminRejectPayment":
          return m.adminRejectPaymentAction(db, ctx, p);
        case "studentRequestPayment":
          return m.studentPayAction(
            db,
            ctx,
            p.assignmentId ? String(p.assignmentId) : undefined
          );
        case "studentStartCheckout":
          return m.studentStartCheckoutAction(db, ctx);
        case "getIncomeOverview":
          return m.getIncomeOverviewAction(db, ctx);
        case "getTeacherPayRates":
          return m.getTeacherPayRatesAction(db, ctx, p);
        case "setTeacherPayRates":
          return m.setTeacherPayRatesAction(db, ctx, p);
        case "getPayrollOverview":
          return m.getPayrollOverviewAction(db, ctx, p);
        case "getTeacherPayrollDetail":
          return m.getTeacherPayrollDetailAction(db, ctx, p);
        case "createTeacherPayout":
          return m.createTeacherPayoutAction(db, ctx, p);
        case "previewPayrollBackfill":
          return m.previewPayrollBackfillAction(db, ctx, p);
        case "getTestGradesStats":
          return m.getTestGradesStatsAction(db, ctx, p);
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
        case "transferKnowledge":
          return m.transferKnowledgeAction(db, ctx, p);
        case "transferFolderToTeachers":
          return m.transferFolderToTeachersAction(db, ctx, p);
        case "transferFolderToSchool":
          return m.transferFolderToSchoolAction(db, ctx, p);
        case "saveToSchoolLibrary":
          return m.saveToSchoolLibraryAction(db, ctx, p);
        case "createMockExam":
          return createMockExam(db, ctx, p);
        case "updateMockExam":
          return updateMockExam(db, ctx, p);
        case "deleteMockExam":
          return deleteMockExam(db, ctx, String(p.id ?? ""));
        case "setMockExamResult":
          return setMockExamResult(db, ctx, p);
        case "upsertIntensive":
          return m.upsertIntensiveAction(db, ctx, p);
        case "deleteIntensive":
          return m.deleteIntensiveAction(db, ctx, String(p.id ?? ""));
        case "assignIntensive":
          return m.assignIntensiveAction(db, ctx, p);
        case "removeIntensiveFile":
          return m.removeIntensiveFileAction(
            db,
            ctx,
            String(p.intensiveId ?? ""),
            String(p.fileId ?? "")
          );
        case "reportCameraBackgroundDiag":
          return m.reportCameraBackgroundDiagAction(db, ctx, p);
        default:
          throw validationError(`Неизвестное действие: ${raw.action}`);
      }
    };

    const idempotent = new Set([
      "submitHomeworkAssignment",
      "reviewHomeworkAssignment",
      "assignHomework",
      "assignTheory",
      "assignIntensive",
      "transferKnowledge",
      "transferFolderToTeachers",
      "transferFolderToSchool",
      "saveToSchoolLibrary",
      "markTheoryViewed",
      "completeLesson",
      "resetLessonConduct",
      "studentRequestPayment",
      "studentStartCheckout",
      "assignTariff",
      "setStudentPurchaseTariff",
      "adminMarkPaymentPaid",
      "adminRejectPayment",
      "createTeacherPayout",
      "setTeacherPayRates",
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
