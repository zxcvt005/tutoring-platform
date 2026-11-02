import { jsonError, jsonOk } from "@/server/errors";
import { assertVideoLabEnabled } from "@/server/video/lab-access";
import { listMissingLivekitEnv } from "@/server/video/livekit-config";

export const dynamic = "force-dynamic";

/** Диагностика без значений секретов: какие LiveKit-переменные заданы. */
export async function GET() {
  try {
    assertVideoLabEnabled();
    const missing = listMissingLivekitEnv();
    return jsonOk({
      configured: missing.length === 0,
      missing,
    });
  } catch (err) {
    return jsonError(err);
  }
}
