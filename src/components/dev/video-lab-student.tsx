"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
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
  type LabRole,
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

export function VideoLabStudent({
  role,
  configured,
  transportMode = "auto",
}: {
  role: Extract<LabRole, "student" | "student-a" | "student-b">;
  configured: boolean;
  transportMode?: LabTransportMode;
}) {
  const presetRoom =
    role === "student-a" ? LAB_ROOM_A : role === "student-b" ? LAB_ROOM_B : "";
  const presetName =
    role === "student-a"
      ? "Ученик А"
      : role === "student-b"
        ? "Ученик Б"
        : "";

  const [roomName, setRoomName] = useState(() => presetRoom || "two-party");
  const [displayName, setDisplayName] = useState(() => presetName);
  const [connectionState, setConnectionState] = useState(
    ConnectionState.Disconnected
  );
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);
  const [remoteCount, setRemoteCount] = useState(0);
  const [teacherPublishing, setTeacherPublishing] = useState(false);
  const [iceInfo, setIceInfo] = useState("—");

  const roomRef = useRef<ReturnType<typeof createLabRoom> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const attachLocalCamera = useCallback((room: ReturnType<typeof createLabRoom>) => {
    const el = localVideoRef.current;
    if (!el) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (track) track.attach(el);
  }, []);

  const attachRemote = useCallback((track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video) {
      const el = remoteVideoRef.current;
      if (el) track.attach(el);
    }
    if (track.kind === Track.Kind.Audio) {
      const el = remoteAudioRef.current;
      if (el) track.attach(el);
    }
  }, []);

  const refreshStudentIce = useCallback(
    async (room: ReturnType<typeof createLabRoom>) => {
      try {
        const session = await summarizeLabSession(room);
        const ice = iceSummaryMessage(session.ice);
        setIceInfo(
          `sig=${session.signaling} ${ice} ${session.mediaLine}`
        );
        labDiag({
          slot: "student",
          active: null,
          phase: "session",
          transportMode,
          connection: session.roomState,
          signaling: session.signaling,
          ice,
          dtls: session.ice.dtlsState,
          mic: session.microphoneEnabled,
          camera: session.cameraEnabled,
        });
      } catch {
        setIceInfo("ice=unavailable");
      }
    },
    [transportMode]
  );

  const refreshTeacherPublishing = useCallback((room: ReturnType<typeof createLabRoom>) => {
    let publishing = false;
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (
          (pub.source === Track.Source.Microphone ||
            pub.source === Track.Source.Camera) &&
          !pub.isMuted &&
          pub.track
        ) {
          publishing = true;
        }
      }
    }
    setTeacherPublishing(publishing);
  }, []);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setConnectionState(ConnectionState.Disconnected);
    setMicEnabled(false);
    setCameraEnabled(false);
    setJoinedRoom(null);
    setRemoteCount(0);
    setTeacherPublishing(false);
    setIceInfo("—");
  }, []);

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  async function connect() {
    const name = displayName.trim();
    if (!name) {
      setError("Укажите имя. Во вкладке преподавателя и у другого ученика имена должны отличаться.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await disconnect();
      const data = await fetchLabToken({
        roomName,
        identity: `${name}-${randomSuffix()}`,
        displayName: name,
      });

      const room = createLabRoom();
      roomRef.current = room;

      room.on(RoomEvent.SignalConnected, () => {
        labDiag({
          slot: "student",
          active: null,
          phase: "signaling-connected",
          connection: room.state,
          signaling: "connected",
          transportMode,
          message: room.name || roomName,
        });
      });
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        labDiag({
          slot: "student",
          active: null,
          phase: "connection",
          connection: state,
          signaling: state,
          transportMode,
          message: room.name || roomName,
        });
        setConnectionState(state);
      });
      room.on(RoomEvent.Reconnecting, () => {
        labDiag({
          slot: "student",
          active: null,
          phase: "reconnecting",
          message: room.name || roomName,
        });
      });
      room.on(RoomEvent.Disconnected, () => {
        labDiag({
          slot: "student",
          active: null,
          phase: "disconnected",
          message: room.name || roomName,
        });
        setConnectionState(ConnectionState.Disconnected);
        setJoinedRoom(null);
        setTeacherPublishing(false);
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        attachRemote(track);
        setRemoteCount(room.remoteParticipants.size);
        refreshTeacherPublishing(room);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
        setRemoteCount(room.remoteParticipants.size);
        refreshTeacherPublishing(room);
      });
      room.on(RoomEvent.TrackMuted, (publication, participant) => {
        if (!participant.isLocal) {
          const track = publication.track;
          if (track?.kind === Track.Kind.Audio && remoteAudioRef.current) {
            track.detach(remoteAudioRef.current);
          }
          if (track?.kind === Track.Kind.Video && remoteVideoRef.current) {
            track.detach(remoteVideoRef.current);
            remoteVideoRef.current.srcObject = null;
          }
        }
        refreshTeacherPublishing(room);
      });
      room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
        if (!participant.isLocal && publication.track) {
          attachRemote(publication.track as RemoteTrack);
        }
        refreshTeacherPublishing(room);
      });
      room.on(RoomEvent.ParticipantConnected, () => {
        setRemoteCount(room.remoteParticipants.size);
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        setRemoteCount(room.remoteParticipants.size);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        refreshTeacherPublishing(room);
      });
      room.on(RoomEvent.LocalTrackPublished, () => {
        attachLocalCamera(room);
      });
      room.on(RoomEvent.MediaDevicesError, (err) => {
        setError(labDiagErrorMessage("student", deviceErrorMessage(err)));
      });

      labDiag({
        slot: "student",
        active: null,
        phase: "signal-connect-start",
        transportMode,
        message: data.roomName,
      });
      await connectLabRoom(
        room,
        data.serverUrl,
        data.participantToken,
        transportMode
      );
      setJoinedRoom(data.roomName);
      setConnectionState(room.state);
      labDiag({
        slot: "student",
        active: null,
        phase: "room-connected",
        transportMode,
        connection: room.state,
        signaling: room.state,
        message: data.roomName,
      });
      await refreshStudentIce(room);

      try {
        await runLabPublish({
          slot: "student",
          room,
          kind: "microphone",
          enabled: true,
          transportMode,
          action: () => room.localParticipant.setMicrophoneEnabled(true),
        });
        setMicEnabled(room.localParticipant.isMicrophoneEnabled);
      } catch (err) {
        setMicEnabled(false);
        setError(deviceErrorMessage(err));
      }
      try {
        await runLabPublish({
          slot: "student",
          room,
          kind: "camera",
          enabled: true,
          transportMode,
          action: () => room.localParticipant.setCameraEnabled(true),
        });
        setCameraEnabled(room.localParticipant.isCameraEnabled);
        attachLocalCamera(room);
      } catch (err) {
        setCameraEnabled(false);
        setError(deviceErrorMessage(err));
      }
      await refreshStudentIce(room);
    } catch (err) {
      await disconnect();
      setError(labDiagErrorMessage("student", err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    try {
      const next = !micEnabled;
      await runLabPublish({
        slot: "student",
        room,
        kind: "microphone",
        enabled: next,
        transportMode,
        action: () => room.localParticipant.setMicrophoneEnabled(next),
      });
      setMicEnabled(room.localParticipant.isMicrophoneEnabled);
      await refreshStudentIce(room);
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    try {
      const next = !cameraEnabled;
      await runLabPublish({
        slot: "student",
        room,
        kind: "camera",
        enabled: next,
        transportMode,
        action: () => room.localParticipant.setCameraEnabled(next),
      });
      setCameraEnabled(room.localParticipant.isCameraEnabled);
      if (next) attachLocalCamera(room);
      else if (localVideoRef.current) localVideoRef.current.srcObject = null;
      await refreshStudentIce(room);
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  const connected = connectionState === ConnectionState.Connected;
  const roomLocked = role !== "student";

  return (
    <>
      <form
        className="grid gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="lab-room">Комната</Label>
          <Input
            id="lab-room"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            disabled={connected || busy || roomLocked}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            {role === "student"
              ? "Для одиночного звонка оба браузера указывают одно имя комнаты."
              : `Фиксированная комната эксперимента. На сервере: lab-${roomName}.`}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-name">Ваше имя</Label>
          <Input
            id="lab-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={connected || busy}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          {connected ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void disconnect()}
              disabled={busy}
            >
              <PhoneOff data-icon="inline-start" />
              Отключиться
            </Button>
          ) : (
            <Button type="submit" disabled={!configured || busy}>
              Подключиться
            </Button>
          )}
          {connected ? (
            <>
              <Button
                type="button"
                variant={micEnabled ? "secondary" : "outline"}
                onClick={() => void toggleMic()}
              >
                {micEnabled ? (
                  <Mic data-icon="inline-start" />
                ) : (
                  <MicOff data-icon="inline-start" />
                )}
                {micEnabled ? "Микрофон" : "Микрофон выкл."}
              </Button>
              <Button
                type="button"
                variant={cameraEnabled ? "secondary" : "outline"}
                onClick={() => void toggleCamera()}
              >
                {cameraEnabled ? (
                  <Video data-icon="inline-start" />
                ) : (
                  <VideoOff data-icon="inline-start" />
                )}
                {cameraEnabled ? "Камера" : "Камера выкл."}
              </Button>
            </>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-full border border-border px-3 py-1">
          Состояние: {STATE_LABEL[connectionState]}
        </span>
        {joinedRoom ? (
          <span className="rounded-full border border-border px-3 py-1">
            Комната: {joinedRoom}
          </span>
        ) : null}
        {connected ? (
          <span className="rounded-full border border-border px-3 py-1">
            Удалённых участников: {remoteCount}
          </span>
        ) : null}
        {connected ? (
          <span className="rounded-full border border-border px-3 py-1">
            Преподаватель в эфире: {teacherPublishing ? "да" : "нет (отошёл)"}
          </span>
        ) : null}
        {connected ? (
          <span className="rounded-full border border-border px-3 py-1">
            Сессия: {iceInfo}
          </span>
        ) : null}
        <span className="rounded-full border border-border px-3 py-1">
          Транспорт: {transportMode}
        </span>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-black">
          <p className="bg-card px-3 py-2 text-xs text-muted-foreground">Вы</p>
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
            Собеседник
          </p>
          <video
            ref={remoteVideoRef}
            className="aspect-video w-full object-cover"
            autoPlay
            playsInline
          />
          <audio ref={remoteAudioRef} autoPlay />
        </section>
      </div>
    </>
  );
}
