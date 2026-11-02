import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/register/teacher/route";

describe("public teacher registration", () => {
  it("is closed and does not create an account", async () => {
    const res = await POST();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/директор/);
  });
});
