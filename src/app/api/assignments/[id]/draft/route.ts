import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { saveDraft } from "@/server/services/assignments-service";

const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).optional(),
  textAnswer: z.string().optional(),
  matching: z.record(z.string(), z.string()).optional(),
  order: z.array(z.string()).optional(),
});

const bodySchema = z.object({
  answers: z.array(answerSchema).max(200),
  attemptNumber: z.union([z.literal(1), z.literal(2)]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const { id } = await params;
    const ctx = await requireAuth(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const result = await saveDraft(
      getDb(),
      ctx,
      id,
      body.answers,
      body.attemptNumber === 2 ? 2 : 1
    );
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
