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
import { submitAssignment } from "@/server/services/assignments-service";

const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).optional(),
  textAnswer: z.string().optional(),
  matching: z.record(z.string(), z.string()).optional(),
  order: z.array(z.string()).optional(),
});

const bodySchema = z.object({
  answers: z.array(answerSchema).max(200),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireAuth(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const db = getDb();
    const routeKey = `POST:/api/assignments/${id}/submit`;
    const idemKey = getIdempotencyKey(request);

    const result = await withIdempotency(db, ctx, routeKey, idemKey, async () => {
      const bodyOut = await submitAssignment(db, ctx, id, body.answers);
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
