"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
  LocalVideoTrack,
  type RemoteTrack,
} from "livekit-client";
import { supportsBackgroundProcessors } from "@livekit/track-processors";
import {
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  PictureInPicture2,
  User,
  Video,
  VideoOff,
} from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CameraBackgroundPicker } from "@/components/video-calls/camera-background-picker";
import {
  CallOverlay,
  callControlClass,
  callTileFrameClass,
} from "@/components/video-calls/call-overlay";
import { InviteStudentsDialog } from "@/components/video-calls/invite-students-dialog";
import { RemoteGrid } from "@/components/video-calls/remote-grid";
import {
  TeacherCallPip,
  type PipMediaEls,
  type TeacherPipRoom,
} from "@/components/video-calls/teacher-call-pip";
import { useDocumentPip } from "@/components/video-calls/use-document-pip";
import { VideoTile } from "@/components/video-calls/video-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HttpStatusError, apiPlatform } from "@/lib/store/api-client";
import {
  connectVideoRoom,
  createVideoRoom,
  ensureVideoRoomConnected,
} from "@/lib/video/connect";
import { canTeacherEnterRoom } from "@/lib/video/teacher-room-access";
import { deviceErrorMessage } from "@/lib/video/device-error";
import { isCurrentCallOp, teacherStageKey } from "@/lib/video/call-op";
import { CameraBackgroundController } from "@/lib/video/camera-background-controller";
import {
  prefetchCameraBackgroundAssets,
  shouldShowCameraBackground,
  type CameraBackgroundChoice,
} from "@/lib/video/camera-background";
import {
  flushCameraBackgroundCrashReport,
  takeCameraBackgroundCrashNotice,
} from "@/lib/video/camera-background-report";
import { MicLevelIndicator } from "@/components/video-calls/mic-level-indicator";
import {
  attachLocalCamera,
  attachPreviewTrack,
  attachRemoteMedia,
  cameraIsPublished,
  playAttachedMedia,
  publishedCameraTrack,
  waitUntilCameraUnpublished,
} from "@/lib/video/media-attach";
import {
  applyNoiseSuppressionToTrack,
  noiseSuppressionSupported,
} from "@/lib/video/noise-suppression";
import {
  extraPublisherError,
  muteAllPublishers,
  switchActivePublisher,
  type PublishControls,
} from "@/lib/video/publish-switch";
import { roomRowClass } from "@/lib/video/room-row-class";
import {
  cabinetTeacherTransport,
  type TeacherCallTransport,
} from "@/lib/video/call-transport";
import type { VideoCallTeacherView, VideoLivekitToken } from "@/lib/video/types";
import { cn } from "@/lib/utils";

function controlsFor(id: string, room: Room): PublishControls {
  const participant = room.localParticipant;
  return {
    id,
    setMicrophoneEnabled: async (enabled) => {
      await participant.setMicrophoneEnabled(enabled);
    },
    setCameraEnabled: async (enabled) => {
      await participant.setCameraEnabled(enabled);
    },
    isMicrophoneEnabled: () => participant.isMicrophoneEnabled,
    isCameraEnabled: () => participant.isCameraEnabled,
  };
}

function publisherList(rooms: Map<string, Room>): PublishControls[] {
  return [...rooms.entries()].map(([id, item]) => controlsFor(id, item));
}

function connectedClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TeacherCallSession({
  callId,
  transport = cabinetTeacherTransport,
  cabinetHref = "/kafedra/calls",
  allowInvite = true,
  overlayLayout = "cabinet",
  header = null,
  emptyRoomsLabel = "Нет приглашённых учеников",
  onEnded,
}: {
  callId: string;
  transport?: TeacherCallTransport;
  cabinetHref?: string;
  allowInvite?: boolean;
  overlayLayout?: "cabinet" | "full";
  header?: ReactNode;
  emptyRoomsLabel?: string;
  onEnded?: () => void;
}) {
  const router = useRouter();
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const pip = useDocumentPip();
  const [call, setCall] = useState<VideoCallTeacherView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [wantMic, setWantMic] = useState(true);
  const [wantCamera, setWantCamera] = useState(true);
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [previewOn, setPreviewOn] = useState(false);
  const [bgChoice, setBgChoice] = useState<CameraBackgroundChoice>({
    type: "off",
  });
  const [bgSupported, setBgSupported] = useState(false);
  const roomsRef = useRef<Map<string, Room>>(new Map());
  const bgRef = useRef<CameraBackgroundController | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pipLocalRef = useRef<HTMLVideoElement | null>(null);
  const pipRemoteRef = useRef<HTMLVideoElement | null>(null);
  const pipAudioRef = useRef<HTMLAudioElement | null>(null);
  const switchingRef = useRef(false);
  const opGenRef = useRef(0);
  const stagedKeyRef = useRef<string | null>(null);
  const wantRef = useRef({ mic: true, camera: true });
  const [noiseOn, setNoiseOn] = useState(true);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const noiseSupported = noiseSuppressionSupported();
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  const callRef = useRef<VideoCallTeacherView | null>(null);
  callRef.current = call;

  const inHold =
    call?.mode === "parallel" && call.status === "active" && !call.activeParticipantId;

  const localEls = useCallback(
    () => [localVideoRef.current, pipLocalRef.current],
    []
  );
  const remoteEls = useCallback(
    () => [remoteVideoRef.current, pipRemoteRef.current],
    []
  );
  const audioEls = useCallback(
    () => [remoteAudioRef.current, pipAudioRef.current],
    []
  );

  useEffect(() => {
    setBgSupported(
      shouldShowCameraBackground({
        userAgent: navigator.userAgent,
        supportsProcessors: supportsBackgroundProcessors(),
      })
    );
    prefetchCameraBackgroundAssets();
    const controller = new CameraBackgroundController();
    const softOff = (message: string) => {
      setBgChoice({ type: "off" });
      setError(message);
    };
    controller.onAutoOff = softOff;
    controller.onFailure = softOff;
    bgRef.current = controller;

    const crash = takeCameraBackgroundCrashNotice();
    if (crash) {
      setError(crash.message);
      void flushCameraBackgroundCrashReport(crash.snapshot, (action, payload) =>
        apiPlatform(action, payload)
      );
    }

    return () => {
      controller.onAutoOff = null;
      controller.onFailure = null;
      void controller.dispose();
      bgRef.current = null;
    };
  }, []);

  const currentCameraTrack = useCallback((): LocalVideoTrack | null => {
    const view = callRef.current;
    if (view?.mode === "parallel" && !view.activeParticipantId) {
      return previewTrackRef.current;
    }
    const room =
      view?.mode === "group"
        ? roomsRef.current.get("group")
        : view?.activeParticipantId
          ? roomsRef.current.get(view.activeParticipantId)
          : undefined;
    return publishedCameraTrack(room) ?? null;
  }, []);

  const applyCameraBackground = useCallback(async () => {
    const track = currentCameraTrack();
    try {
      const result = await bgRef.current?.applyTo(track);
      if (result) setBgChoice(result.choice);
    } catch (err) {
      setBgChoice({ type: "off" });
      bgRef.current?.setDesired({ type: "off" });
      setError(deviceErrorMessage(err));
    }
    const view = callRef.current;
    if (view?.mode === "parallel" && !view.activeParticipantId) {
      attachPreviewTrack(previewTrackRef.current, localEls());
      return;
    }
    const room =
      view?.mode === "group"
        ? roomsRef.current.get("group")
        : view?.activeParticipantId
          ? roomsRef.current.get(view.activeParticipantId)
          : undefined;
    attachLocalCamera(room, localEls());
  }, [currentCameraTrack, localEls]);

  const stopPreview = useCallback(async () => {
    const track = previewTrackRef.current;
    previewTrackRef.current = null;
    setPreviewOn(false);
    if (!track) return;
    await bgRef.current?.release(track);
    track.detach();
    await track.stop();
  }, []);

  const attachStage = useCallback(
    (view: VideoCallTeacherView) => {
      const activeRoom =
        view.mode === "group"
          ? roomsRef.current.get("group")
          : view.activeParticipantId
            ? roomsRef.current.get(view.activeParticipantId)
            : undefined;
      const holding = view.mode === "parallel" && !view.activeParticipantId;
      if (holding) {
        attachPreviewTrack(previewTrackRef.current, localEls());
        attachRemoteMedia(undefined, remoteEls(), audioEls());
        return;
      }
      attachLocalCamera(activeRoom, localEls());
      attachRemoteMedia(activeRoom, remoteEls(), audioEls());
    },
    [audioEls, localEls, remoteEls]
  );

  const ensurePreview = useCallback(async () => {
    if (cameraIsPublished(roomsRef.current.values())) {
      await stopPreview();
      return;
    }
    if (!wantRef.current.camera) {
      await stopPreview();
      attachPreviewTrack(null, localEls());
      return;
    }
    try {
      if (!previewTrackRef.current) {
        previewTrackRef.current = await createLocalVideoTrack();
      }
      await applyCameraBackground();
      setPreviewOn(true);
    } catch (err) {
      setError(deviceErrorMessage(err));
      setPreviewOn(false);
    }
  }, [applyCameraBackground, localEls, stopPreview]);

  const refreshOnline = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const [id, room] of roomsRef.current) {
      next[id] = room.remoteParticipants.size > 0;
    }
    setOnline(next);
  }, []);

  const bindRoom = useCallback(
    (id: string, room: Room) => {
      const onRemote = (track: RemoteTrack) => {
        const view = callRef.current;
        const active = view?.activeParticipantId;
        if (view?.mode === "group" || active === id) {
          if (track.kind === "video") {
            for (const el of remoteEls()) {
              if (!el) continue;
              track.attach(el);
              el.muted = true;
              el.playsInline = true;
            }
          }
          if (track.kind === "audio") {
            for (const el of audioEls()) {
              if (!el) continue;
              track.attach(el);
              el.muted = false;
            }
          }
          void playAttachedMedia([...remoteEls(), ...audioEls()]);
        }
        refreshOnline();
      };
      room.on(RoomEvent.TrackSubscribed, onRemote);
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        refreshOnline();
      });
      const onPresence = () => {
        refreshOnline();
        const view = callRef.current;
        if (view?.mode === "group" || view?.activeParticipantId === id) {
          attachRemoteMedia(room, remoteEls(), audioEls());
        }
      };
      room.on(RoomEvent.ParticipantConnected, onPresence);
      room.on(RoomEvent.ParticipantDisconnected, onPresence);
      room.on(RoomEvent.ConnectionStateChanged, refreshOnline);
      room.on(RoomEvent.LocalTrackPublished, () => {
        const view = callRef.current;
        if (view?.mode === "group" || view?.activeParticipantId === id) {
          void applyCameraBackground();
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        const track = pub.track;
        if (track instanceof LocalVideoTrack) {
          void bgRef.current?.release(track);
        }
      });
    },
    [applyCameraBackground, audioEls, localEls, refreshOnline, remoteEls]
  );

  const showStage = useCallback(
    async (view: VideoCallTeacherView) => {
      if (view.mode === "parallel" && !view.activeParticipantId) {
        attachRemoteMedia(undefined, remoteEls(), audioEls());
        await ensurePreview();
        return;
      }
      await stopPreview();
      attachStage(view);
      await applyCameraBackground();
    },
    [applyCameraBackground, attachStage, audioEls, ensurePreview, remoteEls, stopPreview]
  );

  const syncRooms = useCallback(
    async (view: VideoCallTeacherView, tokens: VideoLivekitToken[]) => {
      const wanted = new Set(
        view.mode === "group"
          ? ["group"]
          : view.participants.filter((p) => p.status === "invited").map((p) => p.id)
      );
      for (const [id, room] of roomsRef.current) {
        if (!wanted.has(id)) {
          room.removeAllListeners();
          await room.disconnect();
          roomsRef.current.delete(id);
        }
      }
      let connectedNew = false;
      for (const token of tokens) {
        const id = view.mode === "group" ? "group" : token.participantId;
        if (!id || roomsRef.current.has(id)) continue;
        connectedNew = true;
        const room = createVideoRoom();
        bindRoom(id, room);
        roomsRef.current.set(id, room);
        await connectVideoRoom(room, token.serverUrl, token.participantToken);
        if (view.mode === "group") {
          await room.localParticipant.setMicrophoneEnabled(wantRef.current.mic);
          await room.localParticipant.setCameraEnabled(wantRef.current.camera);
        }
      }
      refreshOnline();
      const key = teacherStageKey(view);
      if (connectedNew || stagedKeyRef.current !== key) {
        stagedKeyRef.current = key;
        await showStage(view);
      }
    },
    [bindRoom, refreshOnline, showStage]
  );

  const load = useCallback(async () => {
    if (switchingRef.current) return callRef.current;
    const gen = opGenRef.current;
    const data = await transportRef.current.get(callId);
    if (!isCurrentCallOp(gen, opGenRef.current, switchingRef.current)) {
      return callRef.current;
    }
    if (data.call.role !== "teacher") {
      throw new Error("Нет доступа");
    }
    setCall(data.call);
    callRef.current = data.call;
    if (data.call.status === "active") {
      try {
        const tokens = await transportRef.current.tokens(callId);
        if (!isCurrentCallOp(gen, opGenRef.current, switchingRef.current)) {
          return callRef.current;
        }
        await syncRooms(data.call, tokens.tokens);
      } catch (err) {
        if (!(err instanceof HttpStatusError && err.status === 409)) throw err;
      }
    }
    return data.call;
  }, [callId, syncRooms]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!cancelled) await load();
      } catch (err) {
        if (!cancelled) setError(deviceErrorMessage(err));
      }
    })();
    const timer = window.setInterval(() => {
      void load().catch((err) => {
        if (err instanceof HttpStatusError && err.status === 404) {
          setError("Звонок не найден");
        }
      });
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      pip.close();
      void stopPreview();
      for (const room of roomsRef.current.values()) {
        room.removeAllListeners();
        void room.disconnect();
      }
      roomsRef.current.clear();
    };
    // pip.close is stable enough; unmount must hang up rooms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, stopPreview]);

  async function ensureConnectedRoom(participantId: string) {
    let room = roomsRef.current.get(participantId);
    if (room?.state === ConnectionState.Connected) return room;
    const tokens = await transportRef.current.tokens(callId);
    const token = tokens.tokens.find((item) => item.participantId === participantId);
    if (!token) {
      throw new Error("Комната закрыта или недоступна");
    }
    if (!room) {
      room = createVideoRoom();
      bindRoom(participantId, room);
      roomsRef.current.set(participantId, room);
    }
    await ensureVideoRoomConnected(room, token.serverUrl, token.participantToken);
    return room;
  }

  async function activate(participantId: string) {
    if (switchingRef.current || !call || call.mode !== "parallel") return;
    if (call.activeParticipantId === participantId) return;
    const target = call.participants.find((row) => row.id === participantId);
    if (!target || target.status === "closed") {
      setError("Комната закрыта");
      return;
    }
    opGenRef.current += 1;
    const gen = opGenRef.current;
    switchingRef.current = true;
    setSwitching(true);
    setError(null);
    try {
      const room = await ensureConnectedRoom(participantId);
      await stopPreview();
      const controls = publisherList(roomsRef.current);
      await switchActivePublisher(controls, participantId, {
        microphone: wantRef.current.mic,
        camera: wantRef.current.camera,
      });
      const leak = extraPublisherError(
        controls.map((item) => ({
          id: item.id,
          mic: item.isMicrophoneEnabled(),
          camera: item.isCameraEnabled(),
        }))
      );
      if (leak) throw new Error(leak);
      const data = await transportRef.current.activate(callId, participantId);
      if (!isCurrentCallOp(gen, opGenRef.current, false)) return;
      if (data.call.role === "teacher") {
        setCall(data.call);
        callRef.current = data.call;
        stagedKeyRef.current = teacherStageKey(data.call);
      }
      attachLocalCamera(room, localEls());
      attachRemoteMedia(room, remoteEls(), audioEls());
      refreshMicStream(room);
      await applyCameraBackground();
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }

  async function hold() {
    if (switchingRef.current || !call || call.mode !== "parallel") return;
    if (!call.activeParticipantId) return;
    opGenRef.current += 1;
    const gen = opGenRef.current;
    switchingRef.current = true;
    setSwitching(true);
    setError(null);
    try {
      await muteAllPublishers(publisherList(roomsRef.current));
      const leak = extraPublisherError(
        publisherList(roomsRef.current).map((item) => ({
          id: item.id,
          mic: item.isMicrophoneEnabled(),
          camera: item.isCameraEnabled(),
        }))
      );
      if (leak) throw new Error(leak);
      await waitUntilCameraUnpublished(roomsRef.current.values());
      const data = await transportRef.current.hold(callId);
      if (!isCurrentCallOp(gen, opGenRef.current, false)) return;
      if (data.call.role === "teacher") {
        setCall(data.call);
        callRef.current = data.call;
        stagedKeyRef.current = teacherStageKey(data.call);
      }
      attachRemoteMedia(undefined, remoteEls(), audioEls());
      await ensurePreview();
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }

  function refreshMicStream(room?: Room) {
    const target =
      room ??
      (callRef.current?.mode === "group"
        ? roomsRef.current.get("group")
        : callRef.current?.activeParticipantId
          ? roomsRef.current.get(callRef.current.activeParticipantId)
          : undefined);
    const track = target?.localParticipant.getTrackPublication(
      Track.Source.Microphone
    )?.track;
    const media = track?.mediaStreamTrack;
    if (media && media.readyState === "live") {
      setMicStream(new MediaStream([media]));
      void applyNoiseSuppressionToTrack(media, noiseOn).then((result) => {
        if (!result.ok && noiseOn) setNoiseOn(false);
      });
    } else {
      setMicStream(null);
    }
  }

  async function toggleNoise() {
    if (!noiseSupported) return;
    const next = !noiseOn;
    let applied = false;
    for (const room of roomsRef.current.values()) {
      const pub = room.localParticipant.getTrackPublication(
        Track.Source.Microphone
      );
      const result = await applyNoiseSuppressionToTrack(
        pub?.track?.mediaStreamTrack,
        next
      );
      if (result.ok) applied = true;
    }
    if (applied) {
      setNoiseOn(next);
    } else {
      setError(
        "Не удалось изменить шумоподавление. Браузер или устройство не применили настройку."
      );
    }
  }

  async function toggle(kind: "mic" | "camera") {
    const nextMic = kind === "mic" ? !wantMic : wantMic;
    const nextCam = kind === "camera" ? !wantCamera : wantCamera;
    setWantMic(nextMic);
    setWantCamera(nextCam);
    wantRef.current = { mic: nextMic, camera: nextCam };
    const holding = call?.mode === "parallel" && !call.activeParticipantId;
    if (holding) {
      if (kind === "camera") await ensurePreview();
      if (kind === "mic") setMicStream(null);
      return;
    }
    const activeId = call?.mode === "group" ? "group" : call?.activeParticipantId;
    if (!activeId) return;
    const room = roomsRef.current.get(activeId);
    if (!room) return;
    try {
      if (kind === "mic") await room.localParticipant.setMicrophoneEnabled(nextMic);
      else {
        await room.localParticipant.setCameraEnabled(nextCam);
        await applyCameraBackground();
      }
      attachLocalCamera(room, localEls());
      refreshMicStream(room);
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  async function selectBackground(choice: CameraBackgroundChoice) {
    setBgChoice(choice);
    bgRef.current?.setDesired(choice);
    await applyCameraBackground();
  }

  function handlePipEls(els: PipMediaEls) {
    pipLocalRef.current = els.localVideo;
    pipRemoteRef.current = els.remoteVideo;
    pipAudioRef.current = els.remoteAudio;
    if (callRef.current) attachStage(callRef.current);
  }

  async function openPip() {
    setError(null);
    try {
      await pip.openPip({ width: 420, height: 740 });
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: string }).name)
          : "";
      setError(
        name === "NotAllowedError"
          ? "Не удалось открыть мини-окно. Нажмите кнопку ещё раз в Chrome или Edge."
          : deviceErrorMessage(err)
      );
    }
  }

  function returnFromPip() {
    pip.close();
    try {
      window.focus();
    } catch {
      /* ignore */
    }
  }

  async function confirmClose() {
    if (!closeId) return;
    setBusy(true);
    try {
      const data = await transportRef.current.closeParticipant(callId, closeId);
      if (data.call.role === "teacher") {
        setCall(data.call);
        await syncRooms(data.call, (await transportRef.current.tokens(callId)).tokens);
      }
      setCloseId(null);
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnd() {
    setBusy(true);
    try {
      await transportRef.current.end(callId);
      pip.close();
      await bgRef.current?.dispose();
      await stopPreview();
      for (const room of roomsRef.current.values()) {
        room.removeAllListeners();
        await room.disconnect();
      }
      roomsRef.current.clear();
      if (onEnded) onEnded();
      else router.push(cabinetHref);
    } catch (err) {
      setError(deviceErrorMessage(err));
      setBusy(false);
    }
  }

  const activeStudent = call?.participants.find(
    (row) => row.id === call.activeParticipantId
  );
  const localEmpty = !wantCamera
    ? "Камера выключена"
    : inHold && !previewOn
      ? "Нет изображения с камеры"
      : undefined;
  const remoteEmpty = activeStudent
    ? online[activeStudent.id]
      ? undefined
      : "Ученик ещё не подключился"
    : "Выберите комнату";

  const pipRooms: TeacherPipRoom[] = call
    ? [
        ...(call.mode === "parallel"
          ? [
              {
                id: "hold",
                label: "Моя комната",
                active: Boolean(inHold),
                kind: "hold" as const,
              },
            ]
          : []),
        ...call.participants
          .filter((row) => row.status !== "closed")
          .map((row) => ({
            id: row.id,
            label: row.studentName,
            active: row.isActive,
            kind: "student" as const,
          })),
      ]
    : [];

  useEffect(() => {
    if (!pip.open || !call) return;
    pip.render(
      <TeacherCallPip
        rooms={pipRooms}
        inHold={Boolean(inHold) || call.mode === "group"}
        localLabel="Вы"
        remoteLabel={activeStudent?.studentName ?? "Ученик"}
        localEmpty={localEmpty}
        remoteEmpty={call.mode === "group" ? "Общая комната" : remoteEmpty}
        wantMic={wantMic}
        wantCamera={wantCamera}
        switching={switching}
        onHold={() => void hold()}
        onActivate={(id) => void activate(id)}
        onToggle={(kind) => void toggle(kind)}
        onReturn={returnFromPip}
        onMediaEls={handlePipEls}
      />
    );
    // Functions close over current call; re-render pip when visible state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pip.open,
    call,
    inHold,
    localEmpty,
    remoteEmpty,
    wantMic,
    wantCamera,
    switching,
    online,
    previewOn,
    activeStudent?.studentName,
  ]);

  if (!call) {
    return (
      <CallOverlay
        cabinetHref={cabinetHref}
        title="Звонок"
        layout={overlayLayout}
        showBack={overlayLayout === "cabinet"}
      >
        {header}
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {error ?? "Подключение…"}
        </p>
      </CallOverlay>
    );
  }

  const activeRoom =
    call.mode === "group"
      ? roomsRef.current.get("group")
      : call.activeParticipantId
        ? roomsRef.current.get(call.activeParticipantId)
        : undefined;
  const openRooms = call.participants.filter((row) => row.status !== "closed");
  const closedRooms = call.participants.filter((row) => row.status === "closed");
  const callStatus = call.status;
  const callMode = call.mode;

  function roomEnterDisabled(row: (typeof openRooms)[number]) {
    return !canTeacherEnterRoom({
      callStatus,
      mode: callMode,
      roomStatus: row.status,
      isActive: row.isActive,
      switching,
    });
  }

  return (
    <CallOverlay
      cabinetHref={cabinetHref}
      title="Звонок"
      layout={overlayLayout}
      showBack={overlayLayout === "cabinet"}
    >
      {header}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">
            {call.mode === "parallel" ? "Параллельный звонок" : "Групповой звонок"}
          </p>
          <p className="truncate text-sm font-medium">{call.teacherName}</p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {call.mode === "parallel" ? (
            <button
              type="button"
              disabled={switching || call.status !== "active"}
              onClick={() => void hold()}
              className={cn(roomRowClass(Boolean(inHold)), "mb-2")}
            >
              <User className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Моя комната</span>
              {inHold ? <Badge>здесь</Badge> : null}
            </button>
          ) : null}
          {openRooms.length === 0 && closedRooms.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {emptyRoomsLabel}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {openRooms.map((row) => {
              const connected =
                call.mode === "group" ? Boolean(online.group) : Boolean(online[row.id]);
              return (
                <li key={row.id}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={roomEnterDisabled(row)}
                      onClick={() => void activate(row.id)}
                      className={roomRowClass(row.isActive)}
                    >
                      <span className="min-w-0 flex-1 truncate">{row.studentName}</span>
                    </button>
                    {call.status === "active" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Действия: ${row.studentName}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-36">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setCloseId(row.id)}
                            >
                              Закрыть комнату
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                  <p className="px-3 pb-1 text-[11px] text-muted-foreground">
                    {row.presenceLabel ??
                      (row.isActive ? "эфир" : connected ? "в сети" : "не в сети")}
                    {row.connectedAt ? ` · ${connectedClock(row.connectedAt)}` : ""}
                  </p>
                </li>
              );
            })}
            {closedRooms.map((row) => (
              <li key={row.id} className="px-2 py-1 text-sm text-muted-foreground">
                <span className="truncate">{row.studentName}</span>
                <span className="ml-2 text-[11px]">закрыта</span>
                {row.connectedAt ? (
                  <span className="ml-2 text-[11px]">
                    {connectedClock(row.connectedAt)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
        {allowInvite ? (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={call.status !== "active"}
              onClick={() => setInviteOpen(true)}
            >
              Пригласить ученика
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <nav className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {call.mode === "parallel" ? (
            <>
              <button
                type="button"
                disabled={switching || call.status !== "active"}
                onClick={() => void hold()}
                className={cn(roomRowClass(Boolean(inHold)), "w-auto shrink-0 px-3")}
              >
                Моя комната
              </button>
              {openRooms.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  disabled={roomEnterDisabled(row)}
                  onClick={() => void activate(row.id)}
                  className={cn(roomRowClass(row.isActive), "w-auto shrink-0 px-3")}
                >
                  {row.studentName}
                </button>
              ))}
            </>
          ) : (
            <span className="shrink-0 px-1 text-sm text-muted-foreground">
              Групповой звонок
            </span>
          )}
          {allowInvite ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              disabled={call.status !== "active"}
              onClick={() => setInviteOpen(true)}
            >
              Пригласить
            </Button>
          ) : null}
        </nav>
        {error ? (
          <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden overflow-x-hidden px-3 py-2 sm:p-6">
          {call.mode === "group" ? (
            <div className="flex h-full w-full max-w-5xl flex-col gap-3">
              <div className="mx-auto w-full max-w-xl">
                <VideoTile label="Вы" videoRef={localVideoRef} mirror empty={localEmpty} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <RemoteGrid room={activeRoom ?? null} />
              </div>
            </div>
          ) : inHold ? (
            <div className="mx-auto w-full min-w-0 max-w-xl">
              <VideoTile
                label="Вы"
                videoRef={localVideoRef}
                mirror
                empty={localEmpty}
                className={callTileFrameClass}
              />
            </div>
          ) : (
            <div className="grid w-full min-w-0 max-w-4xl grid-cols-1 content-center gap-2 min-[720px]:grid-cols-2 min-[720px]:gap-3">
              <VideoTile
                label="Вы"
                videoRef={localVideoRef}
                mirror
                empty={localEmpty}
                className={callTileFrameClass}
              />
              <VideoTile
                label={activeStudent?.studentName ?? "Ученик"}
                videoRef={remoteVideoRef}
                audioRef={remoteAudioRef}
                empty={remoteEmpty}
                className={callTileFrameClass}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border bg-muted/40 px-3 py-3 max-md:gap-4">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={wantMic ? "secondary" : "outline"}
              size="icon-lg"
              className={callControlClass}
              aria-label={wantMic ? "Выключить микрофон" : "Включить микрофон"}
              onClick={() => void toggle("mic")}
            >
              {wantMic ? <Mic /> : <MicOff />}
            </Button>
            <MicLevelIndicator stream={micStream} active={wantMic} />
          </div>
          {noiseSupported ? (
            <Button
              type="button"
              variant={noiseOn ? "secondary" : "outline"}
              size="sm"
              className="rounded-full text-xs"
              aria-pressed={noiseOn}
              aria-label={
                noiseOn
                  ? "Выключить шумоподавление"
                  : "Включить шумоподавление"
              }
              onClick={() => void toggleNoise()}
            >
              Шум {noiseOn ? "вкл" : "выкл"}
            </Button>
          ) : null}
            <Button
              type="button"
              variant={wantCamera ? "secondary" : "outline"}
              size="icon-lg"
              className={callControlClass}
              aria-label={wantCamera ? "Выключить камеру" : "Включить камеру"}
              onClick={() => void toggle("camera")}
            >
              {wantCamera ? <Video /> : <VideoOff />}
            </Button>
            {bgSupported ? (
              <CameraBackgroundPicker
                choice={bgChoice}
                disabled={call.status !== "active" || !wantCamera}
                onSelect={(choice) => void selectBackground(choice)}
              />
            ) : null}
            {pip.supported ? (
            <Button
              type="button"
              variant={pip.open ? "secondary" : "outline"}
              size="icon-lg"
              className={callControlClass}
              aria-label="Мини-окно"
              disabled={call.status !== "active"}
              onClick={() => void openPip()}
            >
              <PictureInPicture2 />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            size="icon-lg"
            className={callControlClass}
            aria-label="Завершить звонок"
            disabled={call.status !== "active"}
            onClick={() => setEndOpen(true)}
          >
            <PhoneOff />
          </Button>
        </div>
      </div>

      {allowInvite ? (
        <InviteStudentsDialog
          callId={callId}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onInvited={() => void load()}
        />
      ) : null}
      <ConfirmDialog
        open={closeId !== null}
        title="Закрыть комнату?"
        description="Ученик будет отключён и больше не сможет войти в эту комнату."
        confirmLabel="Закрыть комнату"
        busyLabel="Закрытие…"
        busy={busy}
        onOpenChange={(open) => {
          if (!open && !busy) setCloseId(null);
        }}
        onConfirm={() => void confirmClose()}
      />
      <ConfirmDialog
        open={endOpen}
        title="Завершить звонок?"
        description="Все комнаты закроются, участники отключатся."
        confirmLabel="Завершить"
        busyLabel="Завершение…"
        busy={busy}
        onOpenChange={setEndOpen}
        onConfirm={() => void confirmEnd()}
      />
      </div>
    </CallOverlay>
  );
}
