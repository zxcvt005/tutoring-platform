import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { parseBody, readJsonBody } from "@/server/http/request";
import { requirePrivateHost } from "@/server/private-calls/access";
import { setPrivateAccepting } from "@/server/services/private-calls-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accepting: z.boolean(),
});

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    await requirePrivateHost(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const session = await setPrivateAccepting(getDb(), body.accepting);
    return jsonOk({ session });
  } catch (err) {
    return jsonError(err);
  }
}
