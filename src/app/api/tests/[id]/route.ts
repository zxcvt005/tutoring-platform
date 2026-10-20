import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { getTestForViewer } from "@/server/services/assignments-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireAuth(request);
    const data = await getTestForViewer(getDb(), ctx, id);
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
