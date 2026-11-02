import {
  ConnectionState,
  Room,
  Track,
  type RoomConnectOptions,
  type RoomOptions,
} from "livekit-client";

/**
 * Режим транспорта лаборатории.
 * - auto: порядок ICE сервера (UDP → TURN/UDP → ICE/TCP → TURN/TLS).
 * - relay: только ICE relay (TURN). Это не гарантия TURN/TLS :443 —
 *   браузер может выбрать TURN/UDP. iceServers не подменяем.
 */
export type LabTransportMode = "auto" | "relay";

export type IceServerScheme = "turns" | "turn" | "stun" | "other";

export type LabTurnKind =
  | "turn-udp"
  | "turn-tcp"
  | "turn-tls"
  | "turn-tcp-or-tls"
  | "direct"
  | "unknown";

export type IceTransportSummary = {
  iceConnectionState?: string;
  dtlsState?: string;
  localCandidateType?: string;
  remoteCandidateType?: string;
  protocol?: string;
  relayProtocol?: string;
  iceServerScheme?: IceServerScheme;
  turnKind: LabTurnKind;
  usingRelay: boolean;
  connectedAddressKind?: "relay" | "direct" | "unknown";
  audioPackets?: number;
  videoPackets?: number;
};

export type LabSessionSummary = {
  roomState: string;
  signaling: "disconnected" | "connecting" | "connected" | "reconnecting";
  ice: IceTransportSummary;
  mediaLine: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
};

type StatsCapable = {
  getRTCStatsReport?: () => Promise<RTCStatsReport | undefined>;
};

type CandidateLike = RTCStats & {
  candidateType?: string;
  protocol?: string;
  relayProtocol?: string;
  url?: string;
};

export function parseLabTransportMode(
  value: string | null | undefined
): LabTransportMode {
  return value === "relay" ? "relay" : "auto";
}

export function labRoomOptions(): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
  };
}

/**
 * Опции connect. Не задаём iceServers сами: иначе SDK не подставит
 * TURN/TLS, которые отдаёт текущий LiveKit-сервер
 * (см. RTCEngine.makeRTCConfiguration).
 *
 * `iceTransportPolicy: "relay"` запрещает host/srflx, но не выбирает
 * TURN/TLS. В livekit-client@2.23.0 нет публичного способа форсировать
 * только TURN/TLS через TCP 443.
 */
export function labConnectOptions(mode: LabTransportMode = "auto"): RoomConnectOptions {
  const options: RoomConnectOptions = {
    autoSubscribe: true,
    peerConnectionTimeout: 20_000,
    websocketTimeout: 15_000,
    maxRetries: 1,
  };
  if (mode === "relay") {
    options.rtcConfig = {
      iceTransportPolicy: "relay",
    };
  }
  return options;
}

export function createLabRoom(): Room {
  return new Room(labRoomOptions());
}

export async function connectLabRoom(
  room: Room,
  serverUrl: string,
  token: string,
  mode: LabTransportMode = "auto"
): Promise<void> {
  await room.connect(serverUrl, token, labConnectOptions(mode));
}

export function signalingFromRoomState(
  state: ConnectionState | string
): LabSessionSummary["signaling"] {
  if (state === ConnectionState.Connected || state === "connected") {
    return "connected";
  }
  if (state === ConnectionState.Connecting || state === "connecting") {
    return "connecting";
  }
  if (
    state === ConnectionState.Reconnecting ||
    state === ConnectionState.SignalReconnecting ||
    state === "reconnecting" ||
    state === "signalReconnecting"
  ) {
    return "reconnecting";
  }
  return "disconnected";
}

export function iceServerSchemeFromUrl(url: string | undefined): IceServerScheme | undefined {
  if (!url) return undefined;
  const scheme = url.split(":")[0]?.toLowerCase();
  if (scheme === "turns" || scheme === "turn" || scheme === "stun") return scheme;
  return "other";
}

export function inferTurnKind(summary: {
  localCandidateType?: string;
  remoteCandidateType?: string;
  protocol?: string;
  relayProtocol?: string;
  iceServerScheme?: IceServerScheme;
}): LabTurnKind {
  const relay =
    summary.localCandidateType === "relay" ||
    summary.remoteCandidateType === "relay";
  if (!relay) {
    return summary.localCandidateType || summary.remoteCandidateType
      ? "direct"
      : "unknown";
  }
  const relayProtocol = summary.relayProtocol?.toLowerCase();
  if (relayProtocol === "tls" || summary.iceServerScheme === "turns") {
    return "turn-tls";
  }
  if (summary.protocol === "udp" || relayProtocol === "udp") {
    return "turn-udp";
  }
  if (summary.protocol === "tcp" || relayProtocol === "tcp") {
    return summary.iceServerScheme === "turn" ? "turn-tcp" : "turn-tcp-or-tls";
  }
  return "unknown";
}

export function summarizeIceFromStats(stats: RTCStatsReport): IceTransportSummary {
  const summary: IceTransportSummary = {
    usingRelay: false,
    turnKind: "unknown",
  };
  mergeSelectedPair(stats, summary);
  finalizeIceSummary(summary);
  return summary;
}

/**
 * Сводка ICE и публикации только из публичных API:
 * Room.state и Track.getRTCStatsReport(). PeerConnection и
 * iceConnectionState SDK не отдаёт; iceState/dtlsState берём из RTCStats.
 */
export async function summarizeIceTransport(
  room: Room
): Promise<IceTransportSummary> {
  const summary: IceTransportSummary = {
    usingRelay: false,
    turnKind: "unknown",
  };

  for (const pub of room.localParticipant.getTrackPublications()) {
    await mergeTrackStats(pub.track as StatsCapable | undefined, summary);
  }
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.getTrackPublications()) {
      await mergeTrackStats(pub.track as StatsCapable | undefined, summary);
    }
  }

  finalizeIceSummary(summary);
  return summary;
}

export async function summarizeLabSession(room: Room): Promise<LabSessionSummary> {
  const ice = await summarizeIceTransport(room);
  const microphoneEnabled = room.localParticipant.isMicrophoneEnabled;
  const cameraEnabled = room.localParticipant.isCameraEnabled;
  const mediaParts = [
    `mic=${microphoneEnabled ? "on" : "off"}`,
    `cam=${cameraEnabled ? "on" : "off"}`,
    ice.audioPackets !== undefined ? `audioPkts=${ice.audioPackets}` : null,
    ice.videoPackets !== undefined ? `videoPkts=${ice.videoPackets}` : null,
  ].filter(Boolean);
  return {
    roomState: room.state,
    signaling: signalingFromRoomState(room.state),
    ice,
    mediaLine: mediaParts.join(" "),
    cameraEnabled,
    microphoneEnabled,
  };
}

export function iceSummaryMessage(summary: IceTransportSummary): string {
  const parts = [
    summary.iceConnectionState ? `ice=${summary.iceConnectionState}` : null,
    summary.dtlsState ? `dtls=${summary.dtlsState}` : null,
    summary.localCandidateType ? `local=${summary.localCandidateType}` : null,
    summary.remoteCandidateType ? `remote=${summary.remoteCandidateType}` : null,
    summary.protocol ? `proto=${summary.protocol}` : null,
    summary.relayProtocol ? `relayProto=${summary.relayProtocol}` : null,
    summary.turnKind !== "unknown" ? `path=${summary.turnKind}` : null,
    summary.usingRelay ? "relay=yes" : "relay=no",
    summary.audioPackets !== undefined ? `audioPkts=${summary.audioPackets}` : null,
    summary.videoPackets !== undefined ? `videoPkts=${summary.videoPackets}` : null,
  ].filter(Boolean);
  return parts.join(" ") || "ice=pending (нет RTCStats до публикации)";
}

function finalizeIceSummary(summary: IceTransportSummary) {
  if (
    summary.localCandidateType === "relay" ||
    summary.remoteCandidateType === "relay"
  ) {
    summary.usingRelay = true;
    summary.connectedAddressKind = "relay";
  } else if (summary.localCandidateType || summary.remoteCandidateType) {
    summary.connectedAddressKind = "direct";
  }
  summary.turnKind = inferTurnKind(summary);
}

async function mergeTrackStats(
  track: StatsCapable | undefined,
  summary: IceTransportSummary
): Promise<void> {
  if (!track?.getRTCStatsReport) return;
  try {
    const stats = await track.getRTCStatsReport();
    if (stats) mergeSelectedPair(stats, summary);
  } catch {
    // Статистика может быть недоступна до завершения ICE/DTLS.
  }
}

function mergeSelectedPair(stats: RTCStatsReport, summary: IceTransportSummary) {
  for (const report of stats.values()) {
    const row = report as RTCStats & {
      type?: string;
      iceState?: string;
      dtlsState?: string;
      selectedCandidatePairId?: string;
      kind?: string;
      mediaType?: string;
      packetsSent?: number;
      state?: string;
      nominated?: boolean;
      localCandidateId?: string;
      remoteCandidateId?: string;
    };

    if (row.type === "transport") {
      summary.iceConnectionState = row.iceState ?? summary.iceConnectionState;
      summary.dtlsState = row.dtlsState ?? summary.dtlsState;
      if (row.selectedCandidatePairId) {
        applyCandidatePair(
          stats,
          stats.get(row.selectedCandidatePairId) as
            | (RTCStats & {
                localCandidateId?: string;
                remoteCandidateId?: string;
              })
            | undefined,
          summary
        );
      }
    }

    if (row.type === "outbound-rtp") {
      const kind = row.kind || row.mediaType;
      if (kind === "audio" && typeof row.packetsSent === "number") {
        summary.audioPackets = row.packetsSent;
      }
      if (kind === "video" && typeof row.packetsSent === "number") {
        summary.videoPackets = row.packetsSent;
      }
    }

    if (row.type === "candidate-pair") {
      if (row.state !== "succeeded" && !row.nominated) continue;
      applyCandidatePair(stats, row, summary);
    }
  }
}

function applyCandidatePair(
  stats: RTCStatsReport,
  pair:
    | (RTCStats & {
        localCandidateId?: string;
        remoteCandidateId?: string;
      })
    | undefined,
  summary: IceTransportSummary
) {
  if (!pair) return;
  const local = pair.localCandidateId
    ? (stats.get(pair.localCandidateId) as CandidateLike | undefined)
    : undefined;
  const remote = pair.remoteCandidateId
    ? (stats.get(pair.remoteCandidateId) as CandidateLike | undefined)
    : undefined;
  summary.localCandidateType =
    local?.candidateType ?? summary.localCandidateType;
  summary.remoteCandidateType =
    remote?.candidateType ?? summary.remoteCandidateType;
  summary.protocol = local?.protocol ?? summary.protocol;
  summary.relayProtocol = local?.relayProtocol ?? summary.relayProtocol;
  summary.iceServerScheme =
    iceServerSchemeFromUrl(local?.url) ?? summary.iceServerScheme;
}

export function localTrackSourceLine(room: Room): string {
  const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  const cam = room.localParticipant.getTrackPublication(Track.Source.Camera);
  return [
    `micPub=${mic ? (mic.isMuted ? "muted" : "live") : "none"}`,
    `camPub=${cam ? (cam.isMuted ? "muted" : "live") : "none"}`,
  ].join(" ");
}
