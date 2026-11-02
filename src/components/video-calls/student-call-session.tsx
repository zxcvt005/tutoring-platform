"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalVideoTrack, Room, RoomEvent, type RemoteTrack } from "livekit-client";
import { supportsBackgroundProcessors } from "@livekit/track-processors";
import {
  LogOut,
  Mic,
  MicOff,
  PictureInPicture2,
  Video,
  VideoOff,
} from "lucide-react";

import { CameraBackgroundPicker } from "@/components/video-calls/camera-background-picker";
import {
  CallOverlay,
  callControlClass,
  callTileFrameClass,
} from "@/components/video-calls/call-overlay";
import { RemoteGrid } from "@/components/video-calls/remote-grid";
import { StudentCallPip } from "@/components/video-calls/student-call-pip";
import type { PipMediaEls } from "@/components/video-calls/teacher-call-pip";
import { useDocumentPip } from "@/components/video-calls/use-document-pip";
import { VideoTile } from "@/components/video-calls/video-tile";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { HttpStatusError } from "@/lib/store/api-client";
import { connectVideoRoom, createVideoRoom } from "@/lib/video/connect";
import { deviceErrorMessage } from "@/lib/video/device-error";
import { CameraBackgroundController } from "@/lib/video/camera-background-controller";
import {
  shouldShowCameraBackground,
  type CameraBackgroundChoice,
} from "@/lib/video/camera-background";
import {
  attachLocalCamera,
  attachRemoteMedia,
  publishedCameraTrack,
} from "@/lib/video/media-attach";
import { apiVideoCallGet, apiVideoCallTokens } from "@/lib/video/api";
import type { VideoCallStudentView } from "@/lib/video/types";

const WAIT_TEXT =
  "Преподаватель дал вам время на самостоятельное решение задачи";

export function StudentCallSession({ callId }: { callId: string }) {
  const router = useRouter();
  const pip = useDocumentPip();
  const [call, setCall] = useState<VideoCallStudentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wantMic, setWantMic] = useState(true);
  const [wantCamera, setWantCamera] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [liveRoom, setLiveRoom] = useState<Room | null>(null);
  const [bgChoice, setBgChoice] = useState<CameraBackgroundChoice>({
    type: "off",
  });
  const [bgSupported, setBgSupported] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const leavingRef = useRef(false);
  const bgRef = useRef<CameraBackgroundController | null>(null);
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

  useEffect(() => {
    setBgSupported(
      shouldShowCameraBackground({
        userAgent: navigator.userAgent,
        supportsProcessors: supportsBackgroundProcessors(),
      })
    );
    const controller = new CameraBackgroundController();
    controller.onAutoOff = (message) => {
      setBgChoice({ type: "off" });
      setError(message);
    };
    bgRef.current = controller;
    return () => {
      controller.onAutoOff = null;
      void controller.dispose();
      bgRef.current = null;
    };
  }, []);

  const applyCameraBackground = useCallback(async () => {
    const track = publishedCameraTrack(roomRef.current) ?? null;
    try {
      await bgRef.current?.applyTo(track);
    } catch (err) {
      setBgChoice({ type: "off" });
      setError(deviceErrorMessage(err));
    }
    if (roomRef.current) attachLocalCamera(roomRef.current, localEls());
  }, [localEls]);

  const shouldPlayRemote = useCallback((view: VideoCallStudentView | null) => {
    if (!view) return false;
    if (view.mode === "group") return true;
    return view.teacherWithMe;
  }, []);

  const attachStage = useCallback(
    (room: Room, view: VideoCallStudentView | null) => {
      attachLocalCamera(room, localEls());
      if (!shouldPlayRemote(view)) {
        attachRemoteMedia(undefined, remoteEls(), audioEls());
        return;
      }
      attachRemoteMedia(room, remoteEls(), audioEls());
    },
    [audioEls, localEls, remoteEls, shouldPlayRemote]
  );

  const connectOnce = useCallback(
    async (view: VideoCallStudentView) => {
      if (leavingRef.current) return null;
      if (roomRef.current) return roomRef.current;
      const tokens = await apiVideoCallTokens(callId);
      if (leavingRef.current) return null;
      const token = tokens.tokens[0];
      if (!token) throw new Error("Нет доступа к комнате");
      const room = createVideoRoom();
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (shouldPlayRemote(callRef.current)) {
          if (track.kind === "video") {
            for (const el of remoteEls()) if (el) track.attach(el);
          }
          if (track.kind === "audio") {
            for (const el of audioEls()) if (el) track.attach(el);
          }
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach());
      room.on(RoomEvent.LocalTrackPublished, () => {
        void applyCameraBackground();
      });
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        const track = pub.track;
        if (track instanceof LocalVideoTrack) {
          void bgRef.current?.release(track);
        }
      });
      roomRef.current = room;
      setLiveRoom(room);
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
      await room.localParticipant.setMicrophoneEnabled(wantRef.current.mic);
      await room.localParticipant.setCameraEnabled(wantRef.current.camera);
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
      await applyCameraBackground();
      return room;
    },
    [applyCameraBackground, attachStage, audioEls, callId, localEls, remoteEls, shouldPlayRemote]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (leavingRef.current || cancelled) return;
        const data = await apiVideoCallGet(callId);
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
        await applyCameraBackground();
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

  async function toggle(kind: "mic" | "camera") {
    const room = roomRef.current;
    if (!room) return;
    try {
      if (kind === "mic") {
        const next = !wantMic;
        setWantMic(next);
        wantRef.current.mic = next;
        await room.localParticipant.setMicrophoneEnabled(next);
      } else {
        const next = !wantCamera;
        setWantCamera(next);
        wantRef.current.camera = next;
        await room.localParticipant.setCameraEnabled(next);
        await applyCameraBackground();
      }
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
    await bgRef.current?.dispose();
    const room = roomRef.current;
    roomRef.current = null;
    setLiveRoom(null);
    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }
    router.push("/auditoria/calls");
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
      cabinetHref="/auditoria/calls"
      title={call?.teacherName ?? "Звонок"}
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
              <div className="flex h-full w-full max-w-5xl flex-col gap-3">
                <div className="mx-auto w-full max-w-xl">
                  <VideoTile
                    label="Вы"
                    videoRef={localVideoRef}
                    mirror
                    empty={localEmpty}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <RemoteGrid room={liveRoom} />
                </div>
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
          <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border bg-muted/40 px-3 py-3 max-md:gap-4">
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
        title="Выйти из звонка?"
        description="Вы отключитесь, но комната останется. Можно вернуться из кабинета, пока преподаватель не закроет её."
        confirmLabel="Выйти"
        busyLabel="Выход…"
        busy={leaving}
        onOpenChange={setLeaveOpen}
        onConfirm={() => void leaveCall()}
      />
    </CallOverlay>
  );
}
