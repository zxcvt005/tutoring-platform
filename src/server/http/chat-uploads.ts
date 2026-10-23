import type { ChatUploadInput } from "@/server/services/chat-service";

export async function filesFromFormData(form: FormData): Promise<ChatUploadInput[]> {
  const out: ChatUploadInput[] = [];
  for (const item of form.getAll("files")) {
    if (typeof item === "string") continue;
    const file = item as File;
    const bytes = Buffer.from(await file.arrayBuffer());
    out.push({ bytes, filename: file.name || "file" });
  }
  return out;
}

export function isMultipart(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").includes("multipart/form-data");
}
