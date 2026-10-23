import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { getAttachmentForViewer } from "@/server/services/chat-service";

type Params = { params: Promise<{ id: string }> };

function contentDisposition(name: string, download: boolean): string {
  const safe = name.replace(/["\\\r\n]/g, "_");
  const encoded = encodeURIComponent(name);
  const type = download ? "attachment" : "inline";
  return `${type}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireAuth(request);
    const db = getDb();
    const file = await getAttachmentForViewer(db, ctx, id);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.mimeType,
        "content-disposition": contentDisposition(file.originalName, download),
        "cache-control": "private, max-age=60",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
