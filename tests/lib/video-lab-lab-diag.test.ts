import { afterEach, describe, expect, it, vi } from "vitest";

import { labDiag, labDiagErrorMessage, redactLabText } from "@/lib/video-lab/lab-diag";

describe("labDiag", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs room id and omits tokens", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    labDiag({
      slot: "A",
      active: "B",
      phase: "switch-error",
      connection: "reconnecting",
      mic: false,
      camera: true,
      message: "negotiation timed out",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.slot).toBe("A");
    expect(payload.active).toBe("B");
    expect(JSON.stringify(payload)).not.toMatch(/participantToken|LIVEKIT_API|Bearer /);
  });

  it("prefixes visible errors with the room id", () => {
    expect(labDiagErrorMessage("A", new Error("negotiation timed out"))).toBe(
      "[комната A] negotiation timed out"
    );
  });

  it("redacts addresses, ICE urls and JWT-shaped tokens", () => {
    expect(
      redactLabText(
        "udp 203.0.113.10:3478 relay turns:turn.example:443?transport=tcp eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaabbbbbcccccdddddeeeeefffff.ggggghhhhhiiiiijjjjjkkkkk"
      )
    ).toBe("udp [addr] relay [ice-url] [token]");
  });

  it("redacts addresses inside logged messages", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    labDiag({
      slot: "student",
      active: null,
      phase: "session",
      message: "candidate 192.168.1.10:50000",
    });
    const payload = spy.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.message).toBe("candidate [addr]");
  });
});
