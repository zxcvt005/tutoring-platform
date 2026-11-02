"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from "livekit-client";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deviceErrorMessage,
  fetchLabToken,
  LAB_ROOM_A,
  LAB_ROOM_B,
  randomSuffix,
  STATE_LABEL,
  type LabTransportMode,
} from "@/components/dev/video-lab-shared";
import {
  connectLabRoom,
  createLabRoom,
  iceSummaryMessage,
  summarizeLabSession,
} from "@/lib/video-lab/lab-connect";
import { labDiag, labDiagErrorMessage } from "@/lib/video-lab/lab-diag";
import { runLabPublish } from "@/lib/video-lab/lab-publish";
import {
  extraPublisherError,
  switchActivePublisher,
  type PublishControls,
} from "@/lib/video-lab/publish-switch";

type SlotId = "A" | "B";

type SlotView = {
  connection: ConnectionState;
  livekitRoom: string | null;
  remoteCount: number;
  mic: boolean;
  camera: boolean;
};

const EMPTY_SLOT: SlotView = {
  connection: ConnectionState.Disconnected,
  livekitRoom: null,
  remoteCount: 0,
  mic: false,
  camera: false,
};

function controlsFor(
  id: SlotId,
  room: Room,
  transportMode: LabTransportMode
): PublishControls {
  const participant = room.localParticipant;
  return {
    id,
    setMicrophoneEnabled: (enabled) =>
      runLabPublish({
        slot: id,
        room,
        kind: "microphone",
        enabled,
        transportMode,
        action: () => participant.setMicrophoneEnabled(enabled),
      }),
    setCameraEnabled: (enabled) =>
      runLabPublish({
        slot: id,
        room,
        kind: "camera",
        enabled,
        transportMode,
        action: () => participant.setCameraEnabled(enabled),
      }),
    isMicrophoneEnabled: () => participant.isMicrophoneEnabled,
    isCameraEnabled: () => participant.isCameraEnabled,
  };
}

export function VideoLabTeacher({
  configured,
  transportMode = "auto",
}: {
  configured: boolean;
  transportMode?: LabTransportMode;
}) {
  const [displayName, setDisplayName] = useState("Преподаватель");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [active, setActive] = useState<SlotId | null>(null);
  const [wantMic, setWantMic] = useState(true);
  const [wantCamera, setWantCamera] = useState(true);
  const [iceInfo, setIceInfo] = useState<{ A: string; B: string }>({
    A: "—",
    B: "—",
  });
  const [slots, setSlots] = useState<{ A: SlotView; B: SlotView }>({
    A: EMPTY_SLOT,
    B: EMPTY_SLOT,
  });

  const roomsRef = useRef<{ A: Room | null; B: Room | null }>({
    A: null,
    B: null,
  });
  const activeRef = useRef<SlotId | null>(null);
  const switchingRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAVideoRef = useRef<HTMLVideoElement>(null);
  const remoteBVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAAudioRef = useRef<HTMLAudioElement>(null);
  const remoteBAudioRef = useRef<HTMLAudioElement>(null);

  const snapshotSlot = useCallback((room: Room | null): SlotView => {
    if (!room) return EMPTY_SLOT;
    return {
      connection: room.state,
      livekitRoom: room.name || null,
      remoteCount: room.remoteParticipants.size,
      mic: room.localParticipant.isMicrophoneEnabled,
      camera: room.localParticipant.isCameraEnabled,
    };
  }, []);

  const refreshSlots = useCallback(() => {
    setSlots({
      A: snapshotSlot(roomsRef.current.A),
      B: snapshotSlot(roomsRef.current.B),
    });
  }, [snapshotSlot]);

  const refreshIce = useCallback(
    async (id?: SlotId) => {
      const targets = id ? [id] : (["A", "B"] as SlotId[]);
      const patch: Partial<{ A: string; B: string }> = {};
      for (const slot of targets) {
        const room = roomsRef.current[slot];
        if (!room || room.state !== ConnectionState.Connected) {
          patch[slot] = "—";
          continue;
        }
        const session = await summarizeLabSession(room);
        const ice = iceSummaryMessage(session.ice);
        patch[slot] = `sig=${session.signaling} ${ice}`;
        labDiag({
          slot,
          active: activeRef.current,
          phase: "session",
          connection: session.roomState,
          signaling: session.signaling,
          transportMode,
          ice,
          dtls: session.ice.dtlsState,
          mic: session.microphoneEnabled,
          camera: session.cameraEnabled,
        });
      }
      setIceInfo((prev) => ({ ...prev, ...patch }));
    },
    [transportMode]
  );

  const attachLocalCamera = useCallback((room: Room) => {
    const el = localVideoRef.current;
    if (!el) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (pub?.track) pub.track.attach(el);
  }, []);

  const remoteVideoEl = useCallback((id: SlotId) => {
    return id === "A" ? remoteAVideoRef.current : remoteBVideoRef.current;
  }, []);

  const remoteAudioEl = useCallback((id: SlotId) => {
    return id === "A" ? remoteAAudioRef.current : remoteBAudioRef.current;
  }, []);

  const attachRemote = useCallback(
    (id: SlotId, track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video) {
        const el = remoteVideoEl(id);
        if (el) track.attach(el);
      }
      if (track.kind === Track.Kind.Audio) {
        const el = remoteAudioEl(id);
        if (el) track.attach(el);
      }
    },
    [remoteAudioEl, remoteVideoEl]
  );

  const bindRoom = useCallback(
    (id: SlotId, room: Room) => {
      const snapshot = () => ({
        slot: id,
        active: activeRef.current,
        connection: room.state,
        mic: room.localParticipant.isMicrophoneEnabled,
        camera: room.localParticipant.isCameraEnabled,
      });

      room.on(RoomEvent.SignalConnected, () => {
        labDiag({
          ...snapshot(),
          phase: "signaling-connected",
          signaling: "connected",
        });
      });
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        labDiag({
          ...snapshot(),
          phase: "connection",
          connection: state,
          signaling: state,
        });
        refreshSlots();
      });
      room.on(RoomEvent.Reconnecting, () => {
        labDiag({ ...snapshot(), phase: "reconnecting" });
        refreshSlots();
      });
      room.on(RoomEvent.SignalReconnecting, () => {
        labDiag({ ...snapshot(), phase: "signal-reconnecting" });
        refreshSlots();
      });
      room.on(RoomEvent.Reconnected, () => {
        labDiag({ ...snapshot(), phase: "reconnected" });
        refreshSlots();
      });
      room.on(RoomEvent.Disconnected, (reason) => {
        labDiag({
          ...snapshot(),
          phase: "disconnected",
          message: reason !== undefined ? String(reason) : undefined,
        });
        refreshSlots();
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        attachRemote(id, track);
        refreshSlots();
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
        refreshSlots();
      });
      room.on(RoomEvent.TrackMuted, refreshSlots);
      room.on(RoomEvent.TrackUnmuted, refreshSlots);
      room.on(RoomEvent.ParticipantConnected, () => {
        labDiag({
          ...snapshot(),
          phase: "remote-joined",
          message: `remotes=${room.remoteParticipants.size}`,
        });
        refreshSlots();
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        const video = remoteVideoEl(id);
        if (video) video.srcObject = null;
        labDiag({
          ...snapshot(),
          phase: "remote-left",
          message: `remotes=${room.remoteParticipants.size}`,
        });
        refreshSlots();
      });
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        labDiag({
          ...snapshot(),
          phase: "local-published",
          message: String(publication.source),
        });
        if (id === activeRef.current) attachLocalCamera(room);
        refreshSlots();
      });
      room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        labDiag({
          ...snapshot(),
          phase: "local-unpublished",
          message: String(publication.source),
        });
        refreshSlots();
      });
      room.on(RoomEvent.MediaDevicesError, (err) => {
        labDiag({
          ...snapshot(),
          phase: "media-error",
          message: err instanceof Error ? err.message : "media",
        });
        setError(labDiagErrorMessage(id, deviceErrorMessage(err)));
      });
    },
    [attachLocalCamera, attachRemote, refreshSlots, remoteVideoEl]
  );

  const disconnectAll = useCallback(async () => {
    for (const id of ["A", "B"] as SlotId[]) {
      const room = roomsRef.current[id];
      roomsRef.current[id] = null;
      if (room) {
        room.removeAllListeners();
        await room.disconnect();
      }
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteAVideoRef.current) remoteAVideoRef.current.srcObject = null;
    if (remoteBVideoRef.current) remoteBVideoRef.current.srcObject = null;
    if (remoteAAudioRef.current) remoteAAudioRef.current.srcObject = null;
    if (remoteBAudioRef.current) remoteBAudioRef.current.srcObject = null;
    activeRef.current = null;
    setActive(null);
    setSlots({ A: EMPTY_SLOT, B: EMPTY_SLOT });
    setIceInfo({ A: "—", B: "—" });
  }, []);

  useEffect(() => {
    return () => {
      void disconnectAll();
    };
  }, [disconnectAll]);

  async function connectBoth() {
    const name = displayName.trim();
    if (!name) {
      setError("Укажите имя преподавателя.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await disconnectAll();
      const identity = `teacher-${randomSuffix()}`;
      const tokenA = await fetchLabToken({
        roomName: LAB_ROOM_A,
        identity,
        displayName: name,
      });
      const tokenB = await fetchLabToken({
        roomName: LAB_ROOM_B,
        identity,
        displayName: name,
      });

      const roomA = createLabRoom();
      const roomB = createLabRoom();
      roomsRef.current = { A: roomA, B: roomB };
      bindRoom("A", roomA);
      bindRoom("B", roomB);

      labDiag({
        slot: "A",
        active: null,
        phase: "signal-connect-start",
        transportMode,
        message: "teacher dual-room",
      });
      await Promise.all([
        connectLabRoom(
          roomA,
          tokenA.serverUrl,
          tokenA.participantToken,
          transportMode
        ),
        connectLabRoom(
          roomB,
          tokenB.serverUrl,
          tokenB.participantToken,
          transportMode
        ),
      ]);
      labDiag({
        slot: "A",
        active: null,
        phase: "room-connected",
        transportMode,
        connection: roomA.state,
        signaling: roomA.state,
        message: `B=${roomB.state}`,
      });
      refreshSlots();
      void refreshIce();

      await switchActivePublisher(
        [controlsFor("A", roomA, transportMode), controlsFor("B", roomB, transportMode)],
        "A",
        { microphone: true, camera: true }
      );
      setWantMic(true);
      setWantCamera(true);
      activeRef.current = "A";
      setActive("A");
      attachLocalCamera(roomA);
      refreshSlots();
      await refreshIce();
    } catch (err) {
      await disconnectAll();
      setError(deviceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function activate(target: SlotId) {
    const roomA = roomsRef.current.A;
    const roomB = roomsRef.current.B;
    if (!roomA || !roomB || switchingRef.current || target === activeRef.current) {
      return;
    }
    switchingRef.current = true;
    setError(null);
    setSwitching(true);
    try {
      labDiag({
        slot: target,
        active: activeRef.current,
        phase: "switch-start",
        mic: wantMic,
        camera: wantCamera,
      });
      await switchActivePublisher(
        [controlsFor("A", roomA, transportMode), controlsFor("B", roomB, transportMode)],
        target,
        { microphone: wantMic, camera: wantCamera }
      );
      const leak = extraPublisherError([
        {
          id: "A",
          mic: roomA.localParticipant.isMicrophoneEnabled,
          camera: roomA.localParticipant.isCameraEnabled,
        },
        {
          id: "B",
          mic: roomB.localParticipant.isMicrophoneEnabled,
          camera: roomB.localParticipant.isCameraEnabled,
        },
      ]);
      if (leak) throw new Error(leak);
      activeRef.current = target;
      setActive(target);
      labDiag({
        slot: target,
        active: target,
        phase: "switch-done",
        mic: (target === "A" ? roomA : roomB).localParticipant.isMicrophoneEnabled,
        camera: (target === "A" ? roomA : roomB).localParticipant.isCameraEnabled,
      });
      if (wantCamera) attachLocalCamera(target === "A" ? roomA : roomB);
      else if (localVideoRef.current) localVideoRef.current.srcObject = null;
      refreshSlots();
      void refreshIce();
    } catch (err) {
      labDiag({
        slot: target,
        active: activeRef.current,
        phase: "switch-error",
        message: err instanceof Error ? err.message : "switch",
      });
      setError(labDiagErrorMessage(target, err));
      refreshSlots();
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }

  async function toggleMic() {
    if (!active) return;
    const next = !wantMic;
    setWantMic(next);
    const room = roomsRef.current[active];
    if (!room) return;
    try {
      await runLabPublish({
        slot: active,
        room,
        kind: "microphone",
        enabled: next,
        transportMode,
        action: () => room.localParticipant.setMicrophoneEnabled(next),
      });
      refreshSlots();
      void refreshIce(active);
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  async function toggleCamera() {
    if (!active) return;
    const next = !wantCamera;
    setWantCamera(next);
    const room = roomsRef.current[active];
    if (!room) return;
    try {
      await runLabPublish({
        slot: active,
        room,
        kind: "camera",
        enabled: next,
        transportMode,
        action: () => room.localParticipant.setCameraEnabled(next),
      });
      if (next) attachLocalCamera(room);
      else if (localVideoRef.current) localVideoRef.current.srcObject = null;
      refreshSlots();
      void refreshIce(active);
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  const connected =
    slots.A.connection === ConnectionState.Connected &&
    slots.B.connection === ConnectionState.Connected;
  const sessionLive =
    slots.A.connection !== ConnectionState.Disconnected ||
    slots.B.connection !== ConnectionState.Disconnected;
  const leak = extraPublisherError([
    { id: "A", mic: slots.A.mic, camera: slots.A.camera },
    { id: "B", mic: slots.B.mic, camera: slots.B.camera },
  ]);

  return (
    <>
      <form
        className="grid gap-4 rounded-2xl border border-border/70 bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void connectBoth();
        }}
      >
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="lab-teacher-name">Имя преподавателя</Label>
          <Input
            id="lab-teacher-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={sessionLive || busy}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sessionLive ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void disconnectAll()}
              disabled={busy || switching}
            >
              <PhoneOff data-icon="inline-start" />
              Отключиться от обеих
            </Button>
          ) : (
            <Button type="submit" disabled={!configured || busy}>
              Подключиться к комнатам A и B
            </Button>
          )}
          {sessionLive ? (
            <>
              <Button
                type="button"
                variant={wantMic ? "secondary" : "outline"}
                onClick={() => void toggleMic()}
                disabled={switching || !active}
              >
                {wantMic ? (
                  <Mic data-icon="inline-start" />
                ) : (
                  <MicOff data-icon="inline-start" />
                )}
                {wantMic ? "Микрофон (активная)" : "Микрофон выкл."}
              </Button>
              <Button
                type="button"
                variant={wantCamera ? "secondary" : "outline"}
                onClick={() => void toggleCamera()}
                disabled={switching || !active}
              >
                {wantCamera ? (
                  <Video data-icon="inline-start" />
                ) : (
                  <VideoOff data-icon="inline-start" />
                )}
                {wantCamera ? "Камера (активная)" : "Камера выкл."}
              </Button>
            </>
          ) : null}
        </div>
      </form>

      {sessionLive ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["A", "B"] as SlotId[]).map((id) => {
            const slot = slots[id];
            const isActive = active === id;
            return (
              <section
                key={id}
                className={`rounded-2xl border p-4 ${
                  isActive
                    ? "border-primary bg-card"
                    : "border-border/70 bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      Ученик {id}{" "}
                      {isActive ? (
                        <span className="font-normal text-muted-foreground">
                          · активный
                        </span>
                      ) : (
                        <span className="font-normal text-muted-foreground">
                          · удержание
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {slot.livekitRoom ?? `lab-${id === "A" ? LAB_ROOM_A : LAB_ROOM_B}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isActive ? "secondary" : "default"}
                    disabled={switching || isActive || !connected}
                    onClick={() => void activate(id)}
                  >
                    {switching && !isActive
                      ? "Переключение…"
                      : isActive
                        ? "Сейчас здесь"
                        : "Сделать активной"}
                  </Button>
                </div>
                <ul className="mt-3 space-y-1 text-xs">
                  <li>Соединение: {STATE_LABEL[slot.connection]}</li>
                  <li>Учеников в комнате: {slot.remoteCount}</li>
                  <li>
                    Публикация микрофона: {slot.mic ? "да" : "нет"}
                  </li>
                  <li>Публикация камеры: {slot.camera ? "да" : "нет"}</li>
                  <li>Сессия: {iceInfo[id]}</li>
                  <li>Транспорт: {transportMode}</li>
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {leak ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Нарушение инварианта: {leak}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-black">
          <p className="bg-card px-3 py-2 text-xs text-muted-foreground">
            Вы (только активная комната)
          </p>
          <video
            ref={localVideoRef}
            className="aspect-video w-full object-cover"
            autoPlay
            muted
            playsInline
          />
        </section>
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-black">
          <p className="bg-card px-3 py-2 text-xs text-muted-foreground">
            Ученик А
          </p>
          <video
            ref={remoteAVideoRef}
            className="aspect-video w-full object-cover"
            autoPlay
            playsInline
          />
          <audio ref={remoteAAudioRef} autoPlay />
        </section>
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-black">
          <p className="bg-card px-3 py-2 text-xs text-muted-foreground">
            Ученик Б
          </p>
          <video
            ref={remoteBVideoRef}
            className="aspect-video w-full object-cover"
            autoPlay
            playsInline
          />
          <audio ref={remoteBAudioRef} autoPlay />
        </section>
      </div>
    </>
  );
}
