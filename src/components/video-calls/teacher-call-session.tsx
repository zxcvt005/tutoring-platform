"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectionState,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
} from "livekit-client";
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
import {
  CallOverlay,
  callControlClass,
  callTileFrameClass,
} from "@/components/video-calls/call-overlay";
import { DeviceSelect } from "@/components/video-calls/device-select";
import { InviteStudentsDialog } from "@/components/video-calls/invite-students-dialog";
import { GroupCallStage } from "@/components/video-calls/group-call-stage";
import { MicLevelIndicator } from "@/components/video-calls/mic-level-indicator";
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
import { HttpStatusError } from "@/lib/store/api-client";
import {
  connectVideoRoom,
  createVideoRoom,
  ensureVideoRoomConnected,
} from "@/lib/video/connect";
import { canTeacherEnterRoom } from "@/lib/video/teacher-room-access";
import { deviceErrorMessage } from "@/lib/video/device-error";
import { isCurrentCallOp, teacherStageKey } from "@/lib/video/call-op";
import { switchCallDevice } from "@/lib/video/devices";
import { publishLocalMedia } from "@/lib/video/local-publish";
import {
  attachLocalCamera,
  attachPreviewTrack,
  attachRemoteMedia,
  cameraIsPublished,
  waitUntilCameraUnpublished,
} from "@/lib/video/media-attach";
import { parallelWantedRoomIds } from "@/lib/video/parallel-rooms";
import { logMediaPath } from "@/lib/video/media-path-diag";
import {
  createRemoteAttachGate,
  type RemoteAttachGate,
} from "@/lib/video/remote-attach-gate";
import {
  disconnectRoomCleanly,
  isConnectedState,
  isDisconnectedState,
  isTransientConnectionState,
  logRoomDiag,
  roomInstanceTag,
  roomNeedsRecreate,
  tagRoomInstance,
  waitForLocalDevicesIdle,
  waitForRoomSettled,
} from "@/lib/video/room-lifecycle";
import {
  extraPublisherError,
  muteAllPublishers,
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
  const [micDeviceId, setMicDeviceId] = useState("");
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const roomsRef = useRef<Map<string, Room>>(new Map());
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
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  const callRef = useRef<VideoCallTeacherView | null>(null);
  callRef.current = call;
  const callIdRef = useRef(callId);
  callIdRef.current = callId;

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

  const remoteGateRef = useRef<RemoteAttachGate<Room> | null>(null);
  if (!remoteGateRef.current) {
    remoteGateRef.current = createRemoteAttachGate<Room>({
      getVideos: () => [
        remoteVideoRef.current,
        pipRemoteRef.current,
      ],
      getAudios: () => [
        remoteAudioRef.current,
        pipAudioRef.current,
      ],
      attach: (room, videos, audios, reason) => {
        attachRemoteMedia(room, videos, audios, {
          role: "teacher",
          callId: callIdRef.current,
          slotId: callRef.current?.activeParticipantId ?? undefined,
          activeId: callRef.current?.activeParticipantId ?? null,
          reason,
        });
      },
      clear: (videos, audios, reason) => {
        attachRemoteMedia(undefined, videos, audios, {
          role: "teacher",
          callId: callIdRef.current,
          activeId: null,
          reason,
        });
      },
      onEvent: (event, fields) => {
        logRoomDiag(event, { callId: callIdRef.current, ...fields });
      },
    });
  }
  const remoteGate = remoteGateRef.current;

  const bindRemoteVideoRef = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el;
    remoteGateRef.current?.notifyElements(
      el ? "remote_video_mount" : "remote_video_unmount"
    );
  }, []);
  const bindRemoteAudioRef = useCallback((el: HTMLAudioElement | null) => {
    remoteAudioRef.current = el;
    remoteGateRef.current?.notifyElements(
      el ? "remote_audio_mount" : "remote_audio_unmount"
    );
  }, []);

  const stopPreview = useCallback(async () => {
    const track = previewTrackRef.current;
    previewTrackRef.current = null;
    setPreviewOn(false);
    if (!track) return;
    logRoomDiag("preview_stop", { callId, reason: "stop_preview" });
    track.detach();
    await track.stop();
    await waitForLocalDevicesIdle(150);
  }, [callId]);

  const requestRemoteAttach = useCallback(
    (room: Room, slotId: string, reason: string) => {
      return remoteGate.request(room, slotId, reason);
    },
    [remoteGate]
  );

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
        remoteGate.invalidate("attach_stage_hold");
        attachPreviewTrack(previewTrackRef.current, localEls());
        return;
      }
      attachLocalCamera(activeRoom, localEls());
      // GroupCallStage сам рисует remotes — параллельный remote tile не используется.
      if (view.mode === "group") {
        remoteGate.invalidate("attach_stage_group");
        return;
      }
      if (activeRoom && view.activeParticipantId) {
        requestRemoteAttach(activeRoom, view.activeParticipantId, "attach_stage");
      }
    },
    [localEls, remoteGate, requestRemoteAttach]
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
        previewTrackRef.current = await createLocalVideoTrack(
          cameraDeviceId ? { deviceId: cameraDeviceId } : undefined
        );
      }
      attachPreviewTrack(previewTrackRef.current, localEls());
      setPreviewOn(true);
    } catch (err) {
      setError(deviceErrorMessage(err));
      setPreviewOn(false);
    }
  }, [cameraDeviceId, localEls, stopPreview]);

  const refreshOnline = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const [id, room] of roomsRef.current) {
      next[id] = room.remoteParticipants.size > 0;
    }
    setOnline(next);
  }, []);

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
    } else {
      setMicStream(null);
    }
  }

  const republishIfActive = useCallback(
    async (id: string, room: Room) => {
      const view = callRef.current;
      if (!view || view.status !== "active") return;
      const shouldPublish =
        view.mode === "group" || view.activeParticipantId === id;
      if (!shouldPublish) return;
      await publishLocalMedia(room, {
        microphone: wantRef.current.mic,
        camera: wantRef.current.camera,
      });
      attachLocalCamera(room, localEls());
      refreshMicStream(room);
    },
    [localEls]
  );

  const bindRoom = useCallback(
    (id: string, room: Room) => {
      const instance = tagRoomInstance(room);
      const diagBase = () => ({
        callId,
        slotId: id,
        activeId: callRef.current?.activeParticipantId ?? null,
        instance,
        roomName: room.name || undefined,
        identity: room.localParticipant?.identity || undefined,
        roomState: room.state,
      });
      const reattachRemoteIfActive = (reason: string) => {
        const view = callRef.current;
        // Group remotes — в GroupCallStage, не через parallel gate.
        if (view?.mode === "group") return;
        const active = view?.activeParticipantId === id;
        if (!active) {
          logMediaPath("reattach_skipped_inactive", {
            role: "teacher",
            callId,
            slotId: id,
            activeId: view?.activeParticipantId ?? null,
            reason,
            room,
            videos: remoteEls(),
            audios: audioEls(),
            extra: {
              gate: "activeParticipantId_mismatch_or_hold",
            },
          });
          return;
        }
        requestRemoteAttach(room, id, reason);
      };
      const onRemote = () => {
        reattachRemoteIfActive("track_subscribed");
        refreshOnline();
      };
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        logMediaPath("track_subscribed", {
          role: "teacher",
          callId,
          slotId: id,
          activeId: callRef.current?.activeParticipantId ?? null,
          reason: "sdk",
          room,
          extra: {
            trackKind: String(track.kind),
            trackSource: String(publication.source),
            trackSid: publication.trackSid,
            fromIdentity: participant.identity,
            fromSid: participant.sid,
          },
        });
        onRemote();
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        logMediaPath("track_unsubscribed", {
          role: "teacher",
          callId,
          slotId: id,
          activeId: callRef.current?.activeParticipantId ?? null,
          reason: "sdk",
          room,
          extra: {
            trackKind: String(track.kind),
            trackSource: String(publication.source),
            fromIdentity: participant.identity,
          },
        });
        track.detach();
        reattachRemoteIfActive("track_unsubscribed");
        refreshOnline();
      });
      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        logMediaPath("remote_track_published", {
          role: "teacher",
          callId,
          slotId: id,
          activeId: callRef.current?.activeParticipantId ?? null,
          reason: "sdk",
          room,
          extra: {
            trackSource: String(publication.source),
            trackSid: publication.trackSid,
            subscribed: publication.isSubscribed,
            fromIdentity: participant.identity,
          },
        });
        reattachRemoteIfActive("remote_track_published");
      });
      const onPresence = () => {
        refreshOnline();
        reattachRemoteIfActive("participant_presence");
      };
      room.on(RoomEvent.ParticipantConnected, onPresence);
      room.on(RoomEvent.ParticipantDisconnected, onPresence);
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        logRoomDiag("connection_state", {
          ...diagBase(),
          roomState: state,
          reason: "sdk",
        });
        refreshOnline();
        if (state === ConnectionState.Connected) {
          reattachRemoteIfActive("connection_connected");
        }
      });
      room.on(RoomEvent.Reconnected, () => {
        logRoomDiag("reconnected", { ...diagBase(), reason: "sdk" });
        reattachRemoteIfActive("reconnected");
        void republishIfActive(id, room)
          .then(() => {
            reattachRemoteIfActive("reconnected_after_republish");
          })
          .catch((err) => {
            setError(deviceErrorMessage(err));
          });
      });
      room.on(RoomEvent.Disconnected, (disconnectReason) => {
        logRoomDiag("sdk_disconnected", {
          ...diagBase(),
          reason: "sdk",
          initiator: "livekit",
          disconnectReason:
            disconnectReason != null ? String(disconnectReason) : undefined,
        });
        refreshOnline();
      });
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        logMediaPath("local_track_published", {
          role: "teacher",
          callId,
          slotId: id,
          activeId: callRef.current?.activeParticipantId ?? null,
          reason: "sdk",
          room,
          extra: {
            trackSource: String(publication.source),
            trackSid: publication.trackSid,
          },
        });
        const view = callRef.current;
        if (view?.mode === "group" || view?.activeParticipantId === id) {
          attachLocalCamera(room, localEls());
          refreshMicStream(room);
        }
      });
    },
    [
      audioEls,
      callId,
      localEls,
      refreshOnline,
      remoteEls,
      republishIfActive,
      requestRemoteAttach,
    ]
  );

  const showStage = useCallback(
    async (view: VideoCallTeacherView) => {
      if (view.mode === "parallel" && !view.activeParticipantId) {
        remoteGate.invalidate("show_stage_hold");
        await ensurePreview();
        return;
      }
      await stopPreview();
      attachStage(view);
    },
    [attachStage, ensurePreview, remoteGate, stopPreview]
  );

  const dropRoom = useCallback(
    async (id: string, reason: string) => {
      const room = roomsRef.current.get(id);
      if (!room) return;
      roomsRef.current.delete(id);
      await disconnectRoomCleanly(room, reason, {
        callId,
        slotId: id,
        activeId: callRef.current?.activeParticipantId ?? null,
      });
    },
    [callId]
  );

  const syncRooms = useCallback(
    async (view: VideoCallTeacherView, tokens: VideoLivekitToken[]) => {
      // Параллельный режим: только активная комната (или ни одной в hold).
      const wanted = new Set(
        view.mode === "group"
          ? ["group"]
          : parallelWantedRoomIds(view.activeParticipantId)
      );
      for (const id of [...roomsRef.current.keys()]) {
        if (!wanted.has(id)) {
          await dropRoom(id, "sync_unwanted");
          continue;
        }
        const existing = roomsRef.current.get(id);
        if (existing && roomNeedsRecreate(existing)) {
          logRoomDiag("sync_recreate_disconnected", {
            callId,
            slotId: id,
            activeId: view.activeParticipantId,
            instance: roomInstanceTag(existing),
            roomState: existing.state,
            reason: "disconnected_stale",
          });
          await dropRoom(id, "sync_disconnected_stale");
        }
      }
      let connectedNew = false;
      for (const token of tokens) {
        const id = view.mode === "group" ? "group" : token.participantId;
        if (!id || !wanted.has(id)) continue;
        const existing = roomsRef.current.get(id);
        if (existing) {
          if (isConnectedState(existing.state)) continue;
          if (isTransientConnectionState(existing.state)) {
            // Не abort — ждём SDK с лимитом; при неудаче пересоздаём.
            logRoomDiag("sync_wait_transient", {
              callId,
              slotId: id,
              activeId: view.activeParticipantId,
              instance: roomInstanceTag(existing),
              roomState: existing.state,
              reason: "await_sdk_reconnect",
            });
            const settled = await waitForRoomSettled(existing, 12_000);
            if (settled === "connected") continue;
            logRoomDiag("sync_transient_failed", {
              callId,
              slotId: id,
              instance: roomInstanceTag(existing),
              roomState: existing.state,
              reason: settled,
            });
            await dropRoom(id, `sync_after_${settled}`);
          }
        }
        connectedNew = true;
        const room = createVideoRoom();
        tagRoomInstance(room);
        bindRoom(id, room);
        roomsRef.current.set(id, room);
        logRoomDiag("sync_connect", {
          callId,
          slotId: id,
          activeId: view.activeParticipantId,
          instance: roomInstanceTag(room),
          reason: "sync_new",
        });
        await connectVideoRoom(room, token.serverUrl, token.participantToken);
        await publishLocalMedia(room, {
          microphone: wantRef.current.mic,
          camera: wantRef.current.camera,
        });
      }
      refreshOnline();
      const key = teacherStageKey(view);
      const holding = view.mode === "parallel" && !view.activeParticipantId;
      const parallelSlot =
        view.mode === "parallel" ? view.activeParticipantId : null;
      const parallelRoom = parallelSlot
        ? roomsRef.current.get(parallelSlot)
        : undefined;

      // Media attach не зависит от stagedKey: pending/ранний TrackSubscribed
      // должны дожиматься на каждом sync, пока DOM не смонтирован.
      if (holding) {
        remoteGate.invalidate("sync_hold");
      } else if (parallelRoom && parallelSlot) {
        const attachResult = requestRemoteAttach(
          parallelRoom,
          parallelSlot,
          "sync_ensure_remote"
        );
        if (
          attachResult === "attached" ||
          attachResult === "skipped_duplicate"
        ) {
          stagedKeyRef.current = key;
        }
      } else if (view.mode === "group") {
        remoteGate.invalidate("sync_group");
      }

      const needUiStage = connectedNew || stagedKeyRef.current !== key;
      if (needUiStage) {
        await showStage(view);
        if (holding || view.mode === "group") {
          stagedKeyRef.current = key;
        } else if (parallelRoom && parallelSlot) {
          const after = requestRemoteAttach(
            parallelRoom,
            parallelSlot,
            "sync_after_show_stage"
          );
          // stagedKey только после реального attach к DOM, иначе poll повторит.
          if (after === "attached" || after === "skipped_duplicate") {
            stagedKeyRef.current = key;
          }
        }
      }
    },
    [
      bindRoom,
      callId,
      dropRoom,
      refreshOnline,
      remoteGate,
      requestRemoteAttach,
      showStage,
    ]
  );

  const syncRoomsRef = useRef(syncRooms);
  syncRoomsRef.current = syncRooms;

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
        await syncRoomsRef.current(data.call, tokens.tokens);
      } catch (err) {
        if (!(err instanceof HttpStatusError && err.status === 409)) throw err;
      }
    }
    return data.call;
  }, [callId]);

  // Только callId: смена identity load/syncRooms не должна рвать активный Room.
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
      remoteGate.invalidate("effect_unmount_or_call_change");
      const rooms = [...roomsRef.current.entries()];
      roomsRef.current.clear();
      for (const [id, room] of rooms) {
        void disconnectRoomCleanly(room, "effect_unmount_or_call_change", {
          callId,
          slotId: id,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  async function ensureConnectedRoom(participantId: string) {
    let room = roomsRef.current.get(participantId);
    if (room && isConnectedState(room.state)) return room;

    // Transient: ждём SDK, не abort reconnect.
    if (room && isTransientConnectionState(room.state)) {
      logRoomDiag("ensure_wait_transient", {
        callId,
        slotId: participantId,
        activeId: callRef.current?.activeParticipantId ?? null,
        instance: roomInstanceTag(room),
        roomState: room.state,
        reason: "await_sdk_reconnect",
      });
      const settled = await waitForRoomSettled(room, 12_000);
      if (settled === "connected") return room;
      logRoomDiag("ensure_transient_failed", {
        callId,
        slotId: participantId,
        instance: roomInstanceTag(room),
        roomState: room.state,
        reason: settled,
      });
      await dropRoom(participantId, `ensure_after_${settled}`);
      room = undefined;
    } else if (room && isDisconnectedState(room.state)) {
      await dropRoom(participantId, "ensure_disconnected");
      room = undefined;
    }

    const tokens = await transportRef.current.tokens(callId);
    const token = tokens.tokens.find((item) => item.participantId === participantId);
    if (!token) {
      throw new Error("Комната закрыта или недоступна");
    }
    if (!room) {
      room = createVideoRoom();
      tagRoomInstance(room);
      bindRoom(participantId, room);
      roomsRef.current.set(participantId, room);
      logRoomDiag("ensure_new_room", {
        callId,
        slotId: participantId,
        instance: roomInstanceTag(room),
        reason: "create",
      });
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
    const previousId = call.activeParticipantId;
    logRoomDiag("activate_begin", {
      callId,
      slotId: participantId,
      activeId: previousId,
      reason: "user_activate",
    });
    try {
      // Полностью отпускаем preview до LiveKit publish (hold → ученик).
      await stopPreview();
      remoteGate.invalidate("activate_begin");
      await muteAllPublishers(publisherList(roomsRef.current));
      const freed = await waitUntilCameraUnpublished(roomsRef.current.values());
      if (!freed) {
        throw new Error(
          "Камера не освободилась. Повторите переключение."
        );
      }
      for (const id of [...roomsRef.current.keys()]) {
        if (id !== participantId) await dropRoom(id, "activate_leave_other");
      }
      // Повторный вход в тот же slot (hold → ученик): если в map остался
      // Disconnected/битый Room — убираем до connect, иначе ensure пересоздаст.
      const staleTarget = roomsRef.current.get(participantId);
      if (staleTarget && roomNeedsRecreate(staleTarget)) {
        await dropRoom(participantId, "activate_stale_target");
      }
      // Ждём завершения leave + отпускания cam/mic до нового connect (тот же identity).
      await waitForLocalDevicesIdle(180);
      const room = await ensureConnectedRoom(participantId);
      await publishLocalMedia(room, {
        microphone: wantRef.current.mic,
        camera: wantRef.current.camera,
      });
      const leak = extraPublisherError(
        publisherList(roomsRef.current).map((item) => ({
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
        // Не ставим stagedKey до успешного attach — иначе sync не повторит.
      }
      attachLocalCamera(room, localEls());
      const attachResult = requestRemoteAttach(
        room,
        participantId,
        "activate_after_setCall"
      );
      if (
        attachResult === "attached" ||
        attachResult === "skipped_duplicate"
      ) {
        stagedKeyRef.current = teacherStageKey({
          mode: "parallel",
          activeParticipantId: participantId,
        });
      }
      refreshMicStream(room);
      refreshOnline();
      logMediaPath("activate_done_media", {
        role: "teacher",
        callId,
        slotId: participantId,
        activeId: participantId,
        reason: attachResult,
        room,
        videos: remoteEls(),
        audios: audioEls(),
        extra: {
          pending: remoteGate.hasPending(),
          attachedSlot: remoteGate.attachedSlotId(),
        },
      });
      logRoomDiag("activate_done", {
        callId,
        slotId: participantId,
        activeId: participantId,
        instance: roomInstanceTag(room),
        remoteCount: room.remoteParticipants.size,
        reason: attachResult,
      });
    } catch (err) {
      setError(deviceErrorMessage(err));
      logRoomDiag("activate_error", {
        callId,
        slotId: participantId,
        reason: deviceErrorMessage(err),
      });
      if (previousId) {
        try {
          for (const id of [...roomsRef.current.keys()]) {
            if (id !== previousId) await dropRoom(id, "activate_rollback_other");
          }
          await waitForLocalDevicesIdle(120);
          const prev = await ensureConnectedRoom(previousId);
          await publishLocalMedia(prev, {
            microphone: wantRef.current.mic,
            camera: wantRef.current.camera,
          });
          attachLocalCamera(prev, localEls());
          remoteGate.invalidate("activate_rollback_reset");
          requestRemoteAttach(prev, previousId, "activate_rollback");
          refreshMicStream(prev);
        } catch {
          /* оставляем исходную ошибку */
        }
      }
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
    logRoomDiag("hold_begin", {
      callId,
      activeId: call.activeParticipantId,
      reason: "user_hold",
    });
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
      const freed = await waitUntilCameraUnpublished(roomsRef.current.values());
      if (!freed) {
        throw new Error(
          "Камера ещё публикуется. Превью не открываю, чтобы не занять устройство."
        );
      }
      for (const id of [...roomsRef.current.keys()]) {
        await dropRoom(id, "hold_leave_livekit");
      }
      await waitForLocalDevicesIdle(180);
      remoteGate.invalidate("hold_begin_clear");
      const data = await transportRef.current.hold(callId);
      if (!isCurrentCallOp(gen, opGenRef.current, false)) return;
      if (data.call.role === "teacher") {
        setCall(data.call);
        callRef.current = data.call;
        stagedKeyRef.current = teacherStageKey(data.call);
      }
      setMicStream(null);
      setOnline({});
      await ensurePreview();
      logRoomDiag("hold_done", { callId, activeId: null, reason: "ok" });
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      switchingRef.current = false;
      setSwitching(false);
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
      else await room.localParticipant.setCameraEnabled(nextCam);
      attachLocalCamera(room, localEls());
      refreshMicStream(room);
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  async function changeDevice(
    kind: "audioinput" | "videoinput",
    deviceId: string
  ) {
    if (kind === "audioinput") setMicDeviceId(deviceId);
    else setCameraDeviceId(deviceId);
    try {
      const holding = call?.mode === "parallel" && !call?.activeParticipantId;
      if (holding && kind === "videoinput") {
        await stopPreview();
        if (wantRef.current.camera) {
          previewTrackRef.current = await createLocalVideoTrack({
            deviceId,
          });
          attachPreviewTrack(previewTrackRef.current, localEls());
          setPreviewOn(true);
        }
        return;
      }
      await switchCallDevice(roomsRef.current.values(), kind, deviceId);
      const activeId =
        call?.mode === "group" ? "group" : call?.activeParticipantId;
      const room = activeId ? roomsRef.current.get(activeId) : undefined;
      if (room) {
        attachLocalCamera(room, localEls());
        refreshMicStream(room);
      }
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  function handlePipEls(els: PipMediaEls) {
    pipLocalRef.current = els.localVideo;
    pipRemoteRef.current = els.remoteVideo;
    pipAudioRef.current = els.remoteAudio;
    if (callRef.current) attachStage(callRef.current);
    remoteGate.notifyElements("pip_media_els");
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
      await stopPreview();
      const rooms = [...roomsRef.current.entries()];
      roomsRef.current.clear();
      for (const [id, room] of rooms) {
        await disconnectRoomCleanly(room, "call_ended", { callId, slotId: id });
      }
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
                      (row.isActive
                        ? connected
                          ? "эфир"
                          : "эфир · ждём ученика"
                        : call.mode === "parallel"
                          ? "ожидает"
                          : connected
                            ? "в сети"
                            : "не в сети")}
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
            <div className="mx-auto h-full w-full min-w-0 max-w-6xl">
              <GroupCallStage
                room={activeRoom ?? null}
                perspective="teacher"
                local={{
                  label: "Вы",
                  videoRef: localVideoRef,
                  mirror: true,
                  empty: localEmpty,
                  micMuted: !wantMic,
                  cameraOff: !wantCamera,
                }}
              />
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
                videoRef={bindRemoteVideoRef}
                audioRef={bindRemoteAudioRef}
                empty={remoteEmpty}
                className={callTileFrameClass}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-border bg-muted/40 px-3 py-3 max-md:gap-3">
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
            <MicLevelIndicator stream={micStream} active={wantMic && !inHold} />
            <DeviceSelect
              kind="audioinput"
              value={micDeviceId}
              disabled={call.status !== "active"}
              onChange={(id) => void changeDevice("audioinput", id)}
            />
          </div>
          <div className="flex items-center gap-1.5">
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
            <DeviceSelect
              kind="videoinput"
              value={cameraDeviceId}
              disabled={call.status !== "active" || !wantCamera}
              onChange={(id) => void changeDevice("videoinput", id)}
            />
          </div>
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
    </CallOverlay>
  );
}
