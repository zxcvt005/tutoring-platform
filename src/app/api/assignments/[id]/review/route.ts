import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import { withIdempotency } from "@/server/idempotency";
import {
  getIdempotencyKey,
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { reviewAssignment } from "@/server/services/assignments-service";

const bodySchema = z.object({
  updates: z
    .array(
      z.object({
        questionId: z.string().min(1),
        manualScore: z.number().min(0).max(1000),
        teacherComment: z.string().max(2000).optional(),
      })
    )
    .min(1)
    .max(100),
  overallFeedback: z.string().max(5000).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireAuth(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const db = getDb();
    const routeKey = `POST:/api/assignments/${id}/review`;
    const idemKey = getIdempotencyKey(request);

    const result = await withIdempotency(db, ctx, routeKey, idemKey, async () => {
      const bodyOut = await reviewAssignment(
        db,
        ctx,
        id,
        body.updates,
        body.overallFeedback
      );
      return { status: 200, body: bodyOut };
    });

    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.replayed ? { "x-idempotent-replay": "1" } : undefined,
    });
  } catch (err) {
    return jsonError(err);
  }
}
