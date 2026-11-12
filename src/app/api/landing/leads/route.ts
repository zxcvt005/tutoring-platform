import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { assertMemoryRateLimit } from "@/server/auth/rate-limit";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import {
  getClientMeta,
  parseBody,
  readJsonBody,
} from "@/server/http/request";
import { createSiteLeadFromLanding } from "@/server/services/site-leads-service";

/** Strict public schema: unknown keys are stripped by Zod. */
const bodySchema = z.object({
  studentName: z.string().min(1).max(80),
  gradeId: z.enum(["10", "11", "other"]),
  level: z.string().max(120).optional().default(""),
  parentName: z.string().min(1).max(80),
  contact: z.string().min(1).max(120),
  comment: z.string().max(500).optional().default(""),
});

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const meta = getClientMeta(request);
    const ipKey = meta.ip?.trim() || "unknown";
    assertMemoryRateLimit(`landing-lead:${ipKey}`, {
      max: 5,
      windowMs: 15 * 60 * 1000,
      message:
        "Слишком много заявок с этого адреса. Подождите немного и попробуйте снова.",
    });

    const body = parseBody(bodySchema, await readJsonBody(request));
    const result = await createSiteLeadFromLanding(getDb(), {
      studentName: body.studentName,
      gradeId: body.gradeId,
      level: body.level ?? "",
      parentName: body.parentName,
      contact: body.contact,
      comment: body.comment ?? "",
    });
    // Public response: only opaque id, no personal fields.
    return jsonOk({ id: result.id });
  } catch (err) {
    return jsonError(err);
  }
}
