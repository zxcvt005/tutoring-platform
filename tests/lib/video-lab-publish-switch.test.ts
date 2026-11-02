import { describe, expect, it } from "vitest";

import {
  extraPublisherError,
  muteAllPublishers,
  switchActivePublisher,
  type PublishControls,
} from "@/lib/video-lab/publish-switch";

function mockRoom(
  id: string,
  options?: { micStuck?: boolean; cameraStuck?: boolean }
): PublishControls & { mic: boolean; camera: boolean; calls: string[] } {
  const state = {
    id,
    mic: false,
    camera: false,
    calls: [] as string[],
    setMicrophoneEnabled: async (enabled: boolean) => {
      state.calls.push(`mic:${enabled}`);
      if (options?.micStuck && !enabled) return;
      state.mic = enabled;
    },
    setCameraEnabled: async (enabled: boolean) => {
      state.calls.push(`camera:${enabled}`);
      if (options?.cameraStuck && !enabled) return;
      state.camera = enabled;
    },
    isMicrophoneEnabled: () => state.mic,
    isCameraEnabled: () => state.camera,
  };
  return state;
}

describe("switchActivePublisher", () => {
  it("mutes every room without publishing anywhere", async () => {
    const a = mockRoom("A");
    const b = mockRoom("B");
    a.mic = true;
    a.camera = true;
    b.mic = true;
    await muteAllPublishers([a, b]);
    expect(a.mic).toBe(false);
    expect(a.camera).toBe(false);
    expect(b.mic).toBe(false);
    expect(extraPublisherError([a, b])).toBeNull();
  });

  it("mutes every room before enabling the target", async () => {
    const a = mockRoom("A");
    const b = mockRoom("B");
    a.mic = true;
    a.camera = true;

    await switchActivePublisher([a, b], "B", {
      microphone: true,
      camera: true,
    });

    expect(a.mic).toBe(false);
    expect(a.camera).toBe(false);
    expect(b.mic).toBe(true);
    expect(b.camera).toBe(true);
    expect(a.calls.indexOf("mic:false")).toBeLessThan(b.calls.indexOf("mic:true"));
    expect(extraPublisherError([a, b])).toBeNull();
  });

  it("does not enable the target if the previous microphone stays on", async () => {
    const a = mockRoom("A", { micStuck: true });
    const b = mockRoom("B");
    a.mic = true;

    await expect(
      switchActivePublisher([a, b], "B", { microphone: true, camera: false })
    ).rejects.toThrow(/Микрофон в комнате A не выключился/);

    expect(b.calls.some((call) => call === "mic:true")).toBe(false);
    expect(b.mic).toBe(false);
  });

  it("does not enable the target after a signaling error on publish", async () => {
    const a = mockRoom("A");
    const b = mockRoom("B");
    a.mic = true;
    a.camera = true;
    const originalEnable = b.setCameraEnabled.bind(b);
    b.setCameraEnabled = async (enabled: boolean) => {
      if (enabled) {
        throw new Error("NegotiationError: negotiation timed out");
      }
      await originalEnable(enabled);
    };

    await expect(
      switchActivePublisher([a, b], "B", { microphone: true, camera: true })
    ).rejects.toThrow(/negotiation timed out/);

    expect(a.mic).toBe(false);
    expect(a.camera).toBe(false);
    expect(b.mic).toBe(true);
    expect(b.camera).toBe(false);
    expect(extraPublisherError([a, b])).toBeNull();
  });

  it("can recover with a later switch after a failed enable", async () => {
    const a = mockRoom("A");
    const b = mockRoom("B");
    a.mic = true;
    let failOnce = true;
    const originalMic = b.setMicrophoneEnabled.bind(b);
    b.setMicrophoneEnabled = async (enabled: boolean) => {
      if (enabled && failOnce) {
        failOnce = false;
        throw new Error("error reading from signal stream");
      }
      await originalMic(enabled);
    };

    await expect(
      switchActivePublisher([a, b], "B", { microphone: true, camera: false })
    ).rejects.toThrow(/signal stream/);

    await switchActivePublisher([a, b], "B", { microphone: true, camera: false });
    expect(a.mic).toBe(false);
    expect(b.mic).toBe(true);
    expect(extraPublisherError([a, b])).toBeNull();
  });

  it("does not serialize two overlapping switches by itself", async () => {
    const a = mockRoom("A");
    const b = mockRoom("B");
    const yieldThen = async (
      apply: (enabled: boolean) => void,
      enabled: boolean
    ) => {
      await Promise.resolve();
      apply(enabled);
    };
    a.setMicrophoneEnabled = (enabled) =>
      yieldThen((value) => {
        a.mic = value;
        a.calls.push(`mic:${value}`);
      }, enabled);
    b.setMicrophoneEnabled = (enabled) =>
      yieldThen((value) => {
        b.mic = value;
        b.calls.push(`mic:${value}`);
      }, enabled);

    await Promise.all([
      switchActivePublisher([a, b], "A", { microphone: true, camera: false }),
      switchActivePublisher([a, b], "B", { microphone: true, camera: false }),
    ]);

    // Функция сама по себе не очередь: UI держит switchingRef, SDK reconnect — нет.
    expect(a.calls.length + b.calls.length).toBeGreaterThan(0);
  });

  it("reports when two rooms would publish at once", () => {
    expect(
      extraPublisherError([
        { id: "A", mic: true, camera: false },
        { id: "B", mic: true, camera: false },
      ])
    ).toMatch(/Микрофон публикуется сразу/);
    expect(
      extraPublisherError([
        { id: "A", mic: true, camera: false },
        { id: "B", mic: false, camera: true },
      ])
    ).toMatch(/Публикация сразу в комнатах/);
  });
});
