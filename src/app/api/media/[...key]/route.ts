import { readUpload } from "@/server/media/storage";
import { jsonError } from "@/server/errors";

/** Публичная раздача фото преподавателей (без сессии — нужны ученикам). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key: parts } = await context.params;
    const key = parts.map(decodeURIComponent).join("/");
    const { bytes, contentType } = await readUpload(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
