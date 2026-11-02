import type { Room } from "livekit-client";

import {
  iceSummaryMessage,
  localTrackSourceLine,
  summarizeLabSession,
  type LabTransportMode,
} from "@/lib/video-lab/lab-connect";
import {
  labDiag,
  redactLabText,
  type LabDiagEvent,
} from "@/lib/video-lab/lab-diag";

const PACKETS_SAMPLE_MS = 1000;

function activeFromSlot(slot: LabDiagEvent["slot"]): LabDiagEvent["active"] {
  return slot === "A" || slot === "B" ? slot : null;
}

/**
 * Оборачивает setCameraEnabled / setMicrophoneEnabled: фиксирует этап,
 * ошибку SDK и RTCStats после попытки. Не меняет саму публикацию.
 */
export async function runLabPublish(input: {
  slot: LabDiagEvent["slot"];
  room: Room;
  kind: "microphone" | "camera";
  enabled: boolean;
  transportMode?: LabTransportMode;
  action: () => Promise<unknown>;
}): Promise<void> {
  const { slot, room, kind, enabled, transportMode, action } = input;
  const active = activeFromSlot(slot);
  const verb = enabled ? "publish" : "mute";
  labDiag({
    slot,
    active,
    phase: `${verb}-${kind}-start`,
    transportMode,
    connection: room.state,
    signaling: room.state,
    mic: room.localParticipant.isMicrophoneEnabled,
    camera: room.localParticipant.isCameraEnabled,
  });
  try {
    await action();
    if (enabled) {
      await new Promise((resolve) => setTimeout(resolve, PACKETS_SAMPLE_MS));
    }
    const session = await summarizeLabSession(room);
    const packetsSent =
      kind === "microphone" ? session.ice.audioPackets : session.ice.videoPackets;
    labDiag({
      slot,
      active,
      phase: `${verb}-${kind}-ok`,
      transportMode,
      connection: session.roomState,
      signaling: session.signaling,
      ice: iceSummaryMessage(session.ice),
      dtls: session.ice.dtlsState,
      mic: session.microphoneEnabled,
      camera: session.cameraEnabled,
      packetsSent,
      message: `${session.mediaLine} ${localTrackSourceLine(room)}`,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    const raw = err instanceof Error ? err.message : "publish-failed";
    labDiag({
      slot,
      active,
      phase: `${verb}-${kind}-error`,
      transportMode,
      connection: room.state,
      signaling: room.state,
      mic: room.localParticipant.isMicrophoneEnabled,
      camera: room.localParticipant.isCameraEnabled,
      message: redactLabText(`${name}: ${raw}`),
    });
    throw err;
  }
}
