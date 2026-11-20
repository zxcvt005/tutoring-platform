"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import {
  LogOut,
  Mic,
  MicOff,
  PictureInPicture2,
  Video,
  VideoOff,
} from "lucide-react";

import {
  CallOverlay,
  callControlClass,
  callTileFrameClass,
} from "@/components/video-calls/call-overlay";
import { DeviceSelect } from "@/components/video-calls/device-select";
import { GroupCallStage } from "@/components/video-calls/group-call-stage";
import { MicLevelIndicator } from "@/components/video-calls/mic-level-indicator";
import { StudentCallPip } from "@/components/video-calls/student-call-pip";
import type { PipMediaEls } from "@/components/video-calls/teacher-call-pip";
import { useDocumentPip } from "@/components/video-calls/use-document-pip";
import { VideoTile } from "@/components/video-calls/video-tile";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { HttpStatusError } from "@/lib/store/api-client";
import { connectVideoRoom, createVideoRoom } from "@/lib/video/connect";
import { deviceErrorMessage } from "@/lib/video/device-error";
import { switchCallDevice } from "@/lib/video/devices";
import { publishLocalMedia } from "@/lib/video/local-publish";
import {
  attachLocalCamera,
  attachRemoteMedia,
} from "@/lib/video/media-attach";
import { logMediaPath } from "@/lib/video/media-path-diag";
import {
  cabinetStudentTransport,
  type StudentCallTransport,
} from "@/lib/video/call-transport";
import type { VideoCallStudentView } from "@/lib/video/types";

const WAIT_TEXT =
  "Преподаватель дал вам время на самостоятельное решение задачи";

export function StudentCallSession({
  callId,
  transport = cabinetStudentTransport,
  cabinetHref = "/auditoria/calls",
  exitHref = "/auditoria/calls",
  overlayLayout = "cabinet",
  leaveTitle = "Выйти из звонка?",
  leaveDescription = "Вы отключитесь, но комната останется. Можно вернуться из кабинета, пока преподаватель не закроет её.",
  onLeave,
  pulse = false,
  onPulse,
}: {
  callId: string;
  transport?: StudentCallTransport;
  cabinetHref?: string;
  exitHref?: string;
  overlayLayout?: "cabinet" | "full";
  leaveTitle?: string;
  leaveDescription?: string;
  onLeave?: () => Promise<unknown>;
  pulse?: boolean;
  onPulse?: () => Promise<unknown>;
}) {
  const router = useRouter();
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const onPulseRef = useRef(onPulse);
  onPulseRef.current = onPulse;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const pip = useDocumentPip();
  const [call, setCall] = useState<VideoCallStudentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wantMic, setWantMic] = useState(true);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [wantCamera, setWantCamera] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [liveRoom, setLiveRoom] = useState<Room | null>(null);
  const [micDeviceId, setMicDeviceId] = useState("");
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const roomRef = useRef<Room | null>(null);
  const leavingRef = useRef(false);
  const wantRef = useRef({ mic: true, camera: true });
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pipLocalRef = useRef<HTMLVideoElement | null>(null);
  const pipRemoteRef = useRef<HTMLVideoElement | null>(null);
  const pipAudioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<VideoCallStudentView | null>(null);

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

  function refreshMicStream(room: Room | null) {
    const track = room?.localParticipant.getTrackPublication(
      Track.Source.Microphone
    )?.track;
    const media = track?.mediaStreamTrack;
    if (media && media.readyState === "live") {
      setMicStream(new MediaStream([media]));
    } else {
      setMicStream(null);
    }
  }

  const shouldPlayRemote = useCallback((view: VideoCallStudentView | null) => {
    if (!view) return false;
    if (view.mode === "group") return true;
    return view.teacherWithMe;
  }, []);

  const attachStage = useCallback(
    (room: Room, view: VideoCallStudentView | null) => {
      attachLocalCamera(room, localEls());
      if (!shouldPlayRemote(view)) {
        attachRemoteMedia(undefined, remoteEls(), audioEls(), {
          role: "student",
          callId,
          slotId: view?.myParticipantId,
          activeId: view?.teacherWithMe ? view.myParticipantId : null,
          reason: "waiting_teacher_clear_remote",
        });
        return;
      }
      attachRemoteMedia(room, remoteEls(), audioEls(), {
        role: "student",
        callId,
        slotId: view?.myParticipantId,
        activeId: view?.myParticipantId,
        reason: "attach_stage",
      });
    },
    [audioEls, callId, localEls, remoteEls, shouldPlayRemote]
  );

  const ensureLocalPublished = useCallback(async (room: Room) => {
    await publishLocalMedia(room, {
      microphone: wantRef.current.mic,
      camera: wantRef.current.camera,
    });
    refreshMicStream(room);
    attachLocalCamera(room, localEls());
    logMediaPath("student_local_published", {
      role: "student",
      callId,
      slotId: callRef.current?.myParticipantId,
      activeId: callRef.current?.teacherWithMe
        ? callRef.current.myParticipantId
        : null,
      reason: "ensure_local_published",
      room,
      videos: localEls(),
      audios: [],
    });
  }, [callId, localEls]);

  const connectOnce = useCallback(
    async (view: VideoCallStudentView) => {
      if (leavingRef.current) return null;
      if (roomRef.current) return roomRef.current;
      const tokens = await transportRef.current.tokens(callId);
      if (leavingRef.current) return null;
      const token = tokens.tokens[0];
      if (!token) throw new Error("Нет доступа к комнате");
      const room = createVideoRoom();
      const reattachRemote = (reason: string) => {
        if (shouldPlayRemote(callRef.current)) {
          attachRemoteMedia(room, remoteEls(), audioEls(), {
            role: "student",
            callId,
            slotId: callRef.current?.myParticipantId,
            activeId: callRef.current?.myParticipantId,
            reason,
          });
        } else {
          attachRemoteMedia(undefined, remoteEls(), audioEls(), {
            role: "student",
            callId,
            slotId: callRef.current?.myParticipantId,
            activeId: null,
            reason: `${reason}_waiting`,
          });
        }
      };
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        logMediaPath("track_subscribed", {
          role: "student",
          callId,
          slotId: callRef.current?.myParticipantId,
          reason: "sdk",
          room,
          extra: {
            trackKind: String(track.kind),
            trackSource: String(publication.source),
            trackSid: publication.trackSid,
            fromIdentity: participant.identity,
          },
        });
        reattachRemote("track_subscribed");
      });
      room.on(RoomEvent.ParticipantConnected, () => {
        reattachRemote("participant_connected");
      });
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Connected) {
          reattachRemote("connection_connected");
        }
      });
      room.on(RoomEvent.Reconnected, () => {
        void ensureLocalPublished(room)
          .then(() => {
            reattachRemote("reconnected");
          })
          .catch((err) => {
            setError(deviceErrorMessage(err));
          });
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        reattachRemote("track_unsubscribed");
      });
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        logMediaPath("local_track_published", {
          role: "student",
          callId,
          slotId: callRef.current?.myParticipantId,
          reason: "sdk",
          room,
          extra: {
            trackSource: String(publication.source),
            trackSid: publication.trackSid,
          },
        });
        attachLocalCamera(room, localEls());
        refreshMicStream(room);
      });
      roomRef.current = room;
      setLiveRoom(room);
      logMediaPath("student_connect_begin", {
        role: "student",
        callId,
        slotId: view.myParticipantId,
        reason: "connect_once",
        room,
        extra: {
          roomNameFromToken: token.roomName,
          identityFromToken: token.identity,
          teacherWithMe: view.teacherWithMe,
        },
      });
      await connectVideoRoom(room, token.serverUrl, token.participantToken);
      if (leavingRef.current) {
        room.removeAllListeners();
        await room.disconnect();
        if (roomRef.current === room) {
          roomRef.current = null;
          setLiveRoom(null);
        }
        return null;
      }
      await ensureLocalPublished(room);
      if (leavingRef.current) {
        room.removeAllListeners();
        await room.disconnect();
        if (roomRef.current === room) {
          roomRef.current = null;
          setLiveRoom(null);
        }
        return null;
      }
      attachStage(room, view);
      return room;
    },
    [
      attachStage,
      audioEls,
      callId,
      ensureLocalPublished,
      localEls,
      remoteEls,
      shouldPlayRemote,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (leavingRef.current || cancelled) return;
        const data = await transportRef.current.get(callId);
        if (data.call.role !== "student") {
          throw new Error("Нет доступа");
        }
        if (leavingRef.current || cancelled) return;
        setCall(data.call);
        callRef.current = data.call;
        if (data.call.status !== "active" || data.call.myStatus !== "invited") {
          setBlocked(
            data.call.status !== "active"
              ? "Звонок завершён"
              : "Вас отключили от комнаты"
          );
          pip.close();
          if (roomRef.current) {
            roomRef.current.removeAllListeners();
            await roomRef.current.disconnect();
            roomRef.current = null;
            setLiveRoom(null);
          }
          return;
        }
        setBlocked(null);
        const room = await connectOnce(data.call);
        if (!room || leavingRef.current || cancelled) return;
        attachStage(room, data.call);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof HttpStatusError && (err.status === 403 || err.status === 404)) {
          setBlocked("Нет доступа к этой комнате");
          return;
        }
        setError(deviceErrorMessage(err));
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      pip.close();
      if (roomRef.current) {
        roomRef.current.removeAllListeners();
        void roomRef.current.disconnect();
        roomRef.current = null;
        setLiveRoom(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachStage, callId, connectOnce]);

  useEffect(() => {
    if (!pulse) return;
    let stopped = false;
    const run = () => {
      if (stopped) return;
      void onPulseRef.current?.().catch(() => undefined);
    };
    run();
    const timer = window.setInterval(run, 10_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pulse]);

  async function toggle(kind: "mic" | "camera") {
    const room = roomRef.current;
    if (!room) return;
    try {
      if (kind === "mic") {
        const next = !wantMic;
        setWantMic(next);
        wantRef.current.mic = next;
        await room.localParticipant.setMicrophoneEnabled(next);
        refreshMicStream(room);
      } else {
        const next = !wantCamera;
        setWantCamera(next);
        wantRef.current.camera = next;
        await room.localParticipant.setCameraEnabled(next);
        attachLocalCamera(room, localEls());
      }
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
    const room = roomRef.current;
    if (!room) return;
    try {
      await switchCallDevice([room], kind, deviceId);
      attachLocalCamera(room, localEls());
      refreshMicStream(room);
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  function handlePipEls(els: PipMediaEls) {
    pipLocalRef.current = els.localVideo;
    pipRemoteRef.current = els.remoteVideo;
    pipAudioRef.current = els.remoteAudio;
    if (roomRef.current) attachStage(roomRef.current, callRef.current);
  }

  async function openPip() {
    setError(null);
    try {
      await pip.openPip({ width: 400, height: 560 });
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

  async function leaveCall() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    pip.close();
    const room = roomRef.current;
    roomRef.current = null;
    setLiveRoom(null);
    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }
    if (onLeaveRef.current) {
      try {
        await onLeaveRef.current();
      } catch (err) {
        leavingRef.current = false;
        setLeaving(false);
        setError(deviceErrorMessage(err));
      }
      return;
    }
    router.push(exitHref);
  }

  const waitingAlone = Boolean(call?.mode === "parallel" && !call.teacherWithMe);
  const localEmpty = wantCamera ? undefined : "Камера выключена";

  useEffect(() => {
    if (!pip.open || !call) return;
    pip.render(
      <StudentCallPip
        teacherLabel={call.teacherName}
        localLabel="Вы"
        localEmpty={localEmpty}
        showTeacher={!waitingAlone}
        waitText={call.mode === "group" ? "Общая комната" : WAIT_TEXT}
        onReturn={returnFromPip}
        onMediaEls={handlePipEls}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pip.open, call, waitingAlone, localEmpty, wantCamera]);

  if (blocked) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">{blocked}</p>
    );
  }

  return (
    <CallOverlay
      cabinetHref={cabinetHref}
      title={call?.teacherName ?? "Звонок"}
      layout={overlayLayout}
      showBack={overlayLayout === "cabinet"}
    >
      {!call ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {error ?? "Подключение…"}
        </p>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {error ? (
            <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden overflow-x-hidden px-3 py-2 sm:p-6">
            {call.mode === "group" ? (
              <div className="mx-auto h-full w-full min-w-0 max-w-6xl">
                <GroupCallStage
                  room={liveRoom}
                  perspective="student"
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
            ) : (
              <div className="grid w-full min-w-0 max-w-4xl grid-cols-1 content-center gap-2 min-[720px]:grid-cols-2 min-[720px]:gap-3">
                <VideoTile
                  label={call.teacherName}
                  videoRef={remoteVideoRef}
                  audioRef={remoteAudioRef}
                  empty={waitingAlone ? WAIT_TEXT : undefined}
                  className={callTileFrameClass}
                />
                <VideoTile
                  label="Вы"
                  videoRef={localVideoRef}
                  mirror
                  empty={localEmpty}
                  className={callTileFrameClass}
                />
              </div>
            )}
          </div>
          {waitingAlone ? (
            <p className="border-b border-border bg-muted/50 px-4 py-2 text-center text-sm text-muted-foreground">
              Ожидание преподавателя в эфире…
            </p>
          ) : null}
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
              <MicLevelIndicator stream={micStream} active={wantMic} />
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
              aria-label="Выйти из звонка"
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={leaveOpen}
        title={leaveTitle}
        description={leaveDescription}
        confirmLabel="Выйти"
        busyLabel="Выход…"
        busy={leaving}
        onOpenChange={setLeaveOpen}
        onConfirm={() => void leaveCall()}
      />
    </CallOverlay>
  );
}
