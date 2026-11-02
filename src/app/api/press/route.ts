import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { getPressAnalytics } from "@/server/services/press-analytics-service";
import {
  archivePressReminder,
  completePressReminder,
  createPressReminder,
  disablePressReminder,
  getPressReminder,
  listPressReminders,
  uncompletePressReminder,
  updatePressReminder,
} from "@/server/services/press-reminders-service";
import type { PressReminderView } from "@/lib/press-reminders";
import {
  addStudentInteractionNote,
  getPressStudentCard,
  listPressStudents,
  saveStudentCurrentInfo,
} from "@/server/services/student-sales-service";
import {
  addTrialInteractionNote,
  cancelTrialLesson,
  createTrialLesson,
  getTrialLesson,
  listTrialEvents,
  listTrialInteractionNotes,
  listTrialLessons,
  updateTrialLesson,
} from "@/server/services/trial-lessons-service";

const bodySchema = z.object({
  action: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function str(v: unknown): string {
  return String(v ?? "");
}


export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const db = getDb();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "reminders";

    switch (action) {
      case "students":
        return jsonOk(
          await listPressStudents(db, ctx, {
            query: url.searchParams.get("q") ?? undefined,
            bucket: (url.searchParams.get("bucket") as never) ?? "all",
            sort: (url.searchParams.get("sort") as never) ?? "name",
          })
        );
      case "student":
        return jsonOk(
          await getPressStudentCard(db, ctx, str(url.searchParams.get("id")))
        );
      case "trials":
        return jsonOk(
          await listTrialLessons(db, ctx, {
            teacherId: url.searchParams.get("teacherId") ?? undefined,
            agreementStatus: (url.searchParams.get("agreementStatus") as never) ??
              undefined,
            lessonStatus:
              (url.searchParams.get("lessonStatus") as never) ?? undefined,
          })
        );
      case "trial":
        return jsonOk(
          await getTrialLesson(db, ctx, str(url.searchParams.get("id")))
        );
      case "trialEvents":
        return jsonOk(
          await listTrialEvents(db, ctx, str(url.searchParams.get("id")))
        );
      case "trialNotes":
        return jsonOk(
          await listTrialInteractionNotes(db, ctx, str(url.searchParams.get("id")))
        );
      case "reminders":
        return jsonOk(
          await listPressReminders(db, ctx, {
            view: (url.searchParams.get("view") as PressReminderView) ?? "today",
            kind: (url.searchParams.get("kind") as never) ?? "all",
            status: (url.searchParams.get("status") as never) ?? "all",
            from: url.searchParams.get("from") ?? undefined,
            to: url.searchParams.get("to") ?? undefined,
          })
        );
      case "reminder":
        return jsonOk(
          await getPressReminder(db, ctx, str(url.searchParams.get("id")))
        );
      case "analytics":
        return jsonOk(
          await getPressAnalytics(db, ctx, {
            from: str(url.searchParams.get("from")),
            to: str(url.searchParams.get("to")),
            teacherId: url.searchParams.get("teacherId"),
            ownerUserId: url.searchParams.get("ownerUserId"),
          })
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
      case "saveStudentInfo":
        return jsonOk(
          await saveStudentCurrentInfo(db, ctx, str(p.studentId), str(p.currentInfo))
        );
      case "addInteractionNote":
        return jsonOk(
          await addStudentInteractionNote(db, ctx, str(p.studentId), str(p.body))
        );
      case "addTrialNote":
        return jsonOk(
          await addTrialInteractionNote(db, ctx, str(p.trialId), str(p.body))
        );
      case "createTrial":
        return jsonOk(await createTrialLesson(db, ctx, p as never));
      case "updateTrial":
        return jsonOk(
          await updateTrialLesson(db, ctx, str(p.id), p as never)
        );
      case "cancelTrial":
        return jsonOk(
          await cancelTrialLesson(db, ctx, str(p.id), str(p.cancelReason))
        );
      case "createReminder":
        return jsonOk(await createPressReminder(db, ctx, p as never));
      case "updateReminder":
        return jsonOk(
          await updatePressReminder(db, ctx, str(p.id), p as never)
        );
      case "completeReminder":
        return jsonOk(
          await completePressReminder(db, ctx, str(p.id), {
            occurrenceAt: typeof p.occurrenceAt === "string" ? p.occurrenceAt : undefined,
          })
        );
      case "uncompleteReminder":
        return jsonOk(
          await uncompletePressReminder(db, ctx, str(p.id), {
            occurrenceAt: typeof p.occurrenceAt === "string" ? p.occurrenceAt : undefined,
          })
        );
      case "disableReminder":
        return jsonOk(await disablePressReminder(db, ctx, str(p.id)));
      case "archiveReminder":
        return jsonOk(await archivePressReminder(db, ctx, str(p.id)));
      default:
        throw validationError(`Неизвестное действие: ${raw.action}`);
    }
  } catch (err) {
    return jsonError(err);
  }
}
