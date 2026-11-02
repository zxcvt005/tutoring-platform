import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { POST as postLabToken } from "@/app/api/video/lab-token/route";
import { GET as getLabStatus } from "@/app/api/video/lab-status/route";
import {
  createLabLivekitToken,
  labIdentity,
  labRoomName,
} from "@/server/video/create-livekit-token";
import { isVideoLabEnabled } from "@/server/video/lab-access";
import { listMissingLivekitEnv } from "@/server/video/livekit-config";

describe("video lab access and tokens", () => {
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  };

  afterEach(() => {
    process.env.NODE_ENV = prev.NODE_ENV;
    if (prev.LIVEKIT_URL === undefined) delete process.env.LIVEKIT_URL;
    else process.env.LIVEKIT_URL = prev.LIVEKIT_URL;
    if (prev.LIVEKIT_API_KEY === undefined) delete process.env.LIVEKIT_API_KEY;
    else process.env.LIVEKIT_API_KEY = prev.LIVEKIT_API_KEY;
    if (prev.LIVEKIT_API_SECRET === undefined) {
      delete process.env.LIVEKIT_API_SECRET;
    } else {
      process.env.LIVEKIT_API_SECRET = prev.LIVEKIT_API_SECRET;
    }
  });

  it("is disabled in production runtime", () => {
    process.env.NODE_ENV = "production";
    expect(isVideoLabEnabled()).toBe(false);
  });

  it("is enabled outside production", () => {
    process.env.NODE_ENV = "development";
    expect(isVideoLabEnabled()).toBe(true);
  });

  it("lists missing env names without values", () => {
    const missing = listMissingLivekitEnv({
      LIVEKIT_URL: "wss://example.livekit.cloud",
    } as NodeJS.ProcessEnv);
    expect(missing).toEqual(["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]);
    expect(missing.join(" ")).not.toContain("wss://");
  });

  it("prefixes experimental rooms with lab-", () => {
    expect(labRoomName("two-party")).toBe("lab-two-party");
    expect(labRoomName("lab-two-party")).toBe("lab-two-party");
    expect(labRoomName("student-a")).toBe("lab-student-a");
    expect(labRoomName("student-b")).toBe("lab-student-b");
    expect(labIdentity("Teacher-ab12")).toBe("lab-teacher-ab12");
  });

  it("issues a JWT without embedding the api secret in the token payload", async () => {
    process.env.NODE_ENV = "development";
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "devkey";
    process.env.LIVEKIT_API_SECRET = "unit-test-secret-not-used-in-prod";

    const result = await createLabLivekitToken({
      roomName: "two-party",
      identity: "teacher-aaaa",
      displayName: "Учитель",
    });

    expect(result.serverUrl).toBe("wss://example.livekit.cloud");
    expect(result.roomName).toBe("lab-two-party");
    expect(result.identity).toBe("lab-teacher-aaaa");
    const parts = result.participantToken.split(".");
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8")
    ) as { video?: { room?: string; roomJoin?: boolean } };
    expect(payload.video?.roomJoin).toBe(true);
    expect(payload.video?.room).toBe("lab-two-party");
    expect(JSON.stringify(payload)).not.toContain("unit-test-secret-not-used-in-prod");
  });

  it("hides status and token endpoints in production", async () => {
    process.env.NODE_ENV = "production";
    const status = await getLabStatus();
    expect(status.status).toBe(404);

    const token = await postLabToken(
      new Request("http://127.0.0.1:43127/api/video/lab-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomName: "two-party",
          identity: "a",
          displayName: "A",
        }),
      })
    );
    expect(token.status).toBe(404);
  });

  it("does not embed LiveKit secrets in client lab sources", () => {
    const files = [
      "src/components/dev/video-lab-client.tsx",
      "src/components/dev/video-lab-shared.ts",
      "src/components/dev/video-lab-student.tsx",
      "src/components/dev/video-lab-teacher.tsx",
      "src/lib/dev-lan-https.ts",
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("LIVEKIT_API_SECRET");
      expect(text).not.toContain("LIVEKIT_API_KEY");
    }
  });
});

