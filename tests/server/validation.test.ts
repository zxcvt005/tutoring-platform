import { describe, it, expect } from "vitest";
import { z } from "zod";

import { parseBody } from "@/server/http/request";
import { ApiError } from "@/server/errors";
import { verifyPassword } from "@/server/auth/password";

describe("validation + password policy", () => {
  it("parseBody returns validation_error on bad shape", () => {
    const schema = z.object({ email: z.string().email() });
    expect(() => parseBody(schema, { email: "not-an-email" })).toThrow(
      ApiError
    );
    try {
      parseBody(schema, { email: "bad" });
    } catch (e) {
      expect(e).toMatchObject({ code: "validation_error", status: 400 });
    }
  });

  it("rejects placeholder password hashes", async () => {
    expect(await verifyPassword("anything", "!demo-not-for-login!")).toBe(
      false
    );
  });
});
