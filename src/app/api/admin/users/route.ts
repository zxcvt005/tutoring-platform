import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import {
  createOrgUser,
  listOrgUsers,
} from "@/server/services/admin-users-service";

const createSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
  fullName: z.string().min(1).max(200),
  role: z.enum(["director", "teacher", "student"]),
  teacherId: z.string().optional(),
  studentId: z.string().optional(),
  phone: z.string().max(40).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const users = await listOrgUsers(getDb(), ctx);
    return jsonOk({ users });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const body = parseBody(createSchema, await readJsonBody(request));
    const created = await createOrgUser(getDb(), ctx, body);
    return jsonOk(created, { status: 201 } as ResponseInit);
  } catch (err) {
    return jsonError(err);
  }
}
