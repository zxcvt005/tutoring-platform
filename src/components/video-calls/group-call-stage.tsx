"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
} from "livekit-client";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { GroupParticipantTile } from "@/components/video-calls/group-participant-tile";
import { Button } from "@/components/ui/button";
import {
  groupStudentColumns,
  groupStudentPages,
  resolveGroupViewport,
  sliceStudentPage,
  type GroupGridViewport,
} from "@/lib/video/group-grid-layout";
import { cn } from "@/lib/utils";

function isTeacherIdentity(identity: string): boolean {
  return identity.startsWith("t-");
}

function attachRemoteVideo(
  el: HTMLVideoElement | null,
  participant: RemoteParticipant
) {
  if (!el) return;
  const pub = participant.getTrackPublication(Track.Source.Camera);
  if (pub?.track) pub.track.attach(el);
  else el.srcObject = null;
}

function attachRemoteAudio(
  el: HTMLAudioElement | null,
  participant: RemoteParticipant
) {
  if (!el) return;
  const pub = participant.getTrackPublication(Track.Source.Microphone);
  if (pub?.track) pub.track.attach(el);
  else el.srcObject = null;
}

function participantCameraOff(participant: RemoteParticipant): boolean {
  const pub = participant.getTrackPublication(Track.Source.Camera);
  if (!pub) return true;
  if (pub.isMuted) return true;
  return !pub.track;
}

function participantMicMuted(participant: RemoteParticipant): boolean {
  const pub = participant.getTrackPublication(Track.Source.Microphone);
  if (!pub) return true;
  return pub.isMuted || !participant.isMicrophoneEnabled;
}

type LocalSlot = {
  label: string;
  videoRef?: Ref<HTMLVideoElement>;
  mirror?: boolean;
  empty?: string;
  micMuted?: boolean;
  cameraOff?: boolean;
};

type StudentSlot =
  | {
      kind: "remote";
      id: string;
      participant: RemoteParticipant;
    }
  | {
      kind: "local";
      id: "local";
      label: string;
      videoRef?: Ref<HTMLVideoElement>;
      mirror?: boolean;
      empty?: string;
      micMuted?: boolean;
      cameraOff?: boolean;
    };

export function GroupCallStage({
  room,
  perspective,
  local,
  className,
}: {
  room: Room | null;
  /** teacher: локальное видео — центр; student: преподаватель среди remote — центр */
  perspective: "teacher" | "student";
  local: LocalSlot;
  className?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<GroupGridViewport>("desktop");
  const [page, setPage] = useState(0);
  const [remoteIds, setRemoteIds] = useState<string[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const apply = () => setViewport(resolveGroupViewport(el.clientWidth));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!room) {
      setRemoteIds([]);
      return;
    }
    const refresh = () => {
      setRemoteIds([...room.remoteParticipants.keys()]);
      setTick((n) => n + 1);
    };
    refresh();
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.TrackSubscribed, refresh);
    room.on(RoomEvent.TrackUnsubscribed, refresh);
    room.on(RoomEvent.TrackMuted, refresh);
    room.on(RoomEvent.TrackUnmuted, refresh);
    room.on(RoomEvent.LocalTrackPublished, refresh);
    room.on(RoomEvent.LocalTrackUnpublished, refresh);
    return () => {
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
      room.off(RoomEvent.TrackSubscribed, refresh);
      room.off(RoomEvent.TrackUnsubscribed, refresh);
      room.off(RoomEvent.TrackMuted, refresh);
      room.off(RoomEvent.TrackUnmuted, refresh);
      room.off(RoomEvent.LocalTrackPublished, refresh);
      room.off(RoomEvent.LocalTrackUnpublished, refresh);
    };
  }, [room]);

  const remotes = useMemo(() => {
    if (!room) return [] as RemoteParticipant[];
    return remoteIds
      .map((id) => room.remoteParticipants.get(id))
      .filter((p): p is RemoteParticipant => Boolean(p));
  }, [remoteIds, room]);

  const featuredRemote = useMemo(() => {
    if (perspective !== "student") return null;
    return remotes.find((p) => isTeacherIdentity(p.identity)) ?? null;
  }, [perspective, remotes]);

  const studentSlots: StudentSlot[] = useMemo(() => {
    const remoteStudents = remotes.filter((p) => {
      if (perspective === "student" && featuredRemote && p.sid === featuredRemote.sid) {
        return false;
      }
      return !isTeacherIdentity(p.identity) || perspective === "teacher";
    });

    const slots: StudentSlot[] = remoteStudents.map((participant) => ({
      kind: "remote" as const,
      id: participant.sid,
      participant,
    }));

    if (perspective === "student") {
      slots.push({
        kind: "local",
        id: "local",
        label: local.label,
        videoRef: local.videoRef,
        mirror: local.mirror,
        empty: local.empty,
        micMuted: local.micMuted,
        cameraOff: local.cameraOff,
      });
    }

    slots.sort((a, b) => {
      const la = a.kind === "local" ? a.label : a.participant.name || a.participant.identity;
      const lb = b.kind === "local" ? b.label : b.participant.name || b.participant.identity;
      return la.localeCompare(lb, "ru");
    });
    return slots;
  }, [featuredRemote, local, perspective, remotes]);

  const pageCount = groupStudentPages(studentSlots.length, viewport);
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const visible = sliceStudentPage(studentSlots, safePage, viewport);
  const cols = groupStudentColumns(visible.length, viewport);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const goPage = useCallback(
    (next: number) => {
      if (pageCount <= 0) return;
      setPage((next + pageCount) % pageCount);
    },
    [pageCount]
  );

  const waitingStudents = studentSlots.length === 0;

  return (
    <div
      ref={shellRef}
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col gap-3",
        className
      )}
    >
      <div className="mx-auto w-full max-w-3xl shrink-0 px-0 sm:px-2">
        {perspective === "teacher" ? (
          <GroupParticipantTile
            label={local.label}
            videoRef={local.videoRef}
            mirror={local.mirror}
            empty={local.empty}
            micMuted={local.micMuted}
            cameraOff={local.cameraOff}
            featured
            className="mx-auto w-full max-w-[min(100%,42rem)]"
          />
        ) : featuredRemote ? (
          <GroupParticipantTile
            label={featuredRemote.name || "Преподаватель"}
            micMuted={participantMicMuted(featuredRemote)}
            cameraOff={participantCameraOff(featuredRemote)}
            featured
            className="mx-auto w-full max-w-[min(100%,42rem)]"
            videoRef={(el) => attachRemoteVideo(el, featuredRemote)}
            audioRef={(el) => attachRemoteAudio(el, featuredRemote)}
          />
        ) : (
          <GroupParticipantTile
            label="Преподаватель"
            empty="Ожидание преподавателя"
            featured
            className="mx-auto w-full max-w-[min(100%,42rem)]"
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between gap-2 px-0.5">
          <p className="text-xs text-muted-foreground">
            {waitingStudents
              ? "Ожидание участников"
              : `Участники · ${studentSlots.length}`}
            {pageCount > 1 ? ` · стр. ${safePage + 1}/${pageCount}` : ""}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Предыдущая страница"
                onClick={() => goPage(safePage - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Следующая страница"
                onClick={() => goPage(safePage + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>

        {waitingStudents ? (
          <p className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Ожидание участников
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div
              className="grid gap-2.5 sm:gap-3"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {visible.map((slot) => {
                if (slot.kind === "local") {
                  return (
                    <GroupParticipantTile
                      key={slot.id}
                      label={slot.label}
                      videoRef={slot.videoRef}
                      mirror={slot.mirror}
                      empty={slot.empty}
                      micMuted={slot.micMuted}
                      cameraOff={slot.cameraOff}
                      className="min-h-[7.5rem] sm:min-h-[9rem]"
                    />
                  );
                }
                const p = slot.participant;
                return (
                  <GroupParticipantTile
                    key={slot.id}
                    label={p.name || "Участник"}
                    micMuted={participantMicMuted(p)}
                    cameraOff={participantCameraOff(p)}
                    className="min-h-[7.5rem] sm:min-h-[9rem]"
                    videoRef={(el) => attachRemoteVideo(el, p)}
                    audioRef={(el) => attachRemoteAudio(el, p)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
