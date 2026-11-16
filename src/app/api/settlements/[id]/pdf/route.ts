import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { getSettlementDocumentForDownload } from "@/server/services/settlement-documents-service";

type Params = { params: Promise<{ id: string }> };

function contentDisposition(name: string): string {
  const safe = name.replace(/["\\\r\n]/g, "_");
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireAuth(request);
    const db = getDb();
    const file = await getSettlementDocumentForDownload(db, ctx, id);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition(file.fileName),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
