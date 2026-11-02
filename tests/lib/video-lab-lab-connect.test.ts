import { describe, expect, it } from "vitest";

import {
  iceServerSchemeFromUrl,
  iceSummaryMessage,
  inferTurnKind,
  labConnectOptions,
  parseLabTransportMode,
  signalingFromRoomState,
  summarizeIceFromStats,
} from "@/lib/video-lab/lab-connect";

function mockStats(
  entries: Array<Record<string, unknown>>
): RTCStatsReport {
  const map = new Map(
    entries.map((entry) => [String(entry.id), entry as unknown as RTCStats])
  );
  return {
    get: (id: string) => map.get(id),
    values: () => map.values(),
    forEach: (cb: (value: RTCStats, id: string) => void) => {
      map.forEach((value, id) => cb(value, id));
    },
  } as unknown as RTCStatsReport;
}

describe("labConnectOptions", () => {
  it("keeps Cloud ICE servers by not overriding iceServers in auto mode", () => {
    const options = labConnectOptions("auto");
    expect(options.rtcConfig).toBeUndefined();
    expect(options.peerConnectionTimeout).toBe(20_000);
    expect(options.websocketTimeout).toBe(15_000);
    expect(options.maxRetries).toBe(1);
  });

  it("forces relay without replacing iceServers in diagnostic mode", () => {
    const options = labConnectOptions("relay");
    expect(options.rtcConfig?.iceTransportPolicy).toBe("relay");
    expect(options.rtcConfig?.iceServers).toBeUndefined();
  });

  it("parses transport mode from query values", () => {
    expect(parseLabTransportMode("relay")).toBe("relay");
    expect(parseLabTransportMode("auto")).toBe("auto");
    expect(parseLabTransportMode(null)).toBe("auto");
  });

  it("formats ice summary without addresses", () => {
    const message = iceSummaryMessage({
      iceConnectionState: "connected",
      dtlsState: "connected",
      localCandidateType: "relay",
      remoteCandidateType: "relay",
      protocol: "udp",
      usingRelay: true,
      turnKind: "turn-udp",
      connectedAddressKind: "relay",
    });
    expect(message).toContain("relay=yes");
    expect(message).toContain("local=relay");
    expect(message).toContain("path=turn-udp");
    expect(message).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it("treats relay+udp as TURN/UDP, not TLS", () => {
    expect(
      inferTurnKind({
        localCandidateType: "relay",
        protocol: "udp",
      })
    ).toBe("turn-udp");
  });

  it("detects TURN/TLS only from relayProtocol tls or turns scheme", () => {
    expect(
      inferTurnKind({
        localCandidateType: "relay",
        protocol: "tcp",
        relayProtocol: "tls",
      })
    ).toBe("turn-tls");
    expect(
      inferTurnKind({
        localCandidateType: "relay",
        protocol: "tcp",
        iceServerScheme: "turns",
      })
    ).toBe("turn-tls");
    expect(
      inferTurnKind({
        localCandidateType: "relay",
        protocol: "tcp",
      })
    ).toBe("turn-tcp-or-tls");
  });

  it("reads ice/dtls and packet counts from public RTCStats without storing urls", () => {
    const summary = summarizeIceFromStats(
      mockStats([
        {
          id: "t1",
          type: "transport",
          iceState: "connected",
          dtlsState: "connected",
          selectedCandidatePairId: "p1",
        },
        {
          id: "p1",
          type: "candidate-pair",
          state: "succeeded",
          localCandidateId: "l1",
          remoteCandidateId: "r1",
        },
        {
          id: "l1",
          type: "local-candidate",
          candidateType: "relay",
          protocol: "tcp",
          relayProtocol: "tls",
          url: "turns:turn.livekit.cloud:443?transport=tcp",
        },
        {
          id: "r1",
          type: "remote-candidate",
          candidateType: "relay",
          protocol: "tcp",
        },
        {
          id: "v1",
          type: "outbound-rtp",
          kind: "video",
          packetsSent: 12,
        },
      ])
    );
    expect(summary.iceConnectionState).toBe("connected");
    expect(summary.dtlsState).toBe("connected");
    expect(summary.turnKind).toBe("turn-tls");
    expect(summary.iceServerScheme).toBe("turns");
    expect(summary.videoPackets).toBe(12);
    expect(JSON.stringify(summary)).not.toMatch(/turn\.livekit\.cloud/);
    expect(iceServerSchemeFromUrl("turns:example")).toBe("turns");
  });

  it("maps room connection states to signaling stages", () => {
    expect(signalingFromRoomState("connected")).toBe("connected");
    expect(signalingFromRoomState("signalReconnecting")).toBe("reconnecting");
    expect(signalingFromRoomState("disconnected")).toBe("disconnected");
  });
});
