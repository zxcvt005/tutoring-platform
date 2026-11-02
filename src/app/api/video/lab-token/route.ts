import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { jsonError, jsonOk } from "@/server/errors";
import { parseBody, readJsonBody } from "@/server/http/request";
import { createLabLivekitToken } from "@/server/video/create-livekit-token";
import { assertVideoLabEnabled } from "@/server/video/lab-access";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  roomName: z.string().min(1).max(80),
  identity: z.string().min(1).max(80),
  displayName: z.string().min(1).max(80),
});

export async function POST(request: Request) {
  try {
    assertVideoLabEnabled();
    assertMutatingRequest(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const result = await createLabLivekitToken(body);
    return jsonOk(
      {
        serverUrl: result.serverUrl,
        participantToken: result.participantToken,
        roomName: result.roomName,
        identity: result.identity,
      },
      { status: 201 }
    );
  } catch (err) {
    return jsonError(err);
  }
}
