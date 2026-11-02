"use client";

import { useEffect, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";

function attachParticipant(el: HTMLVideoElement | null, participant: RemoteParticipant) {
  if (!el) return;
  const pub = participant.getTrackPublication(Track.Source.Camera);
  if (pub?.track) pub.track.attach(el);
  else el.srcObject = null;
}

export function RemoteGrid({ room }: { room: Room | null }) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!room) {
      setIds([]);
      return;
    }
    const refresh = () => {
      setIds([...room.remoteParticipants.keys()]);
    };
    refresh();
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.TrackSubscribed, refresh);
    room.on(RoomEvent.TrackUnsubscribed, refresh);
    return () => {
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
      room.off(RoomEvent.TrackSubscribed, refresh);
      room.off(RoomEvent.TrackUnsubscribed, refresh);
    };
  }, [room]);

  if (!room || ids.length === 0) {
    return (
      <p className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Ожидание участников
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {ids.map((id) => {
        const participant = room.remoteParticipants.get(id);
        if (!participant) return null;
        return (
          <div
            key={id}
            className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-zinc-950"
          >
            <video
              className="absolute inset-0 size-full bg-zinc-950 object-contain"
              autoPlay
              playsInline
              muted
              ref={(el) => attachParticipant(el, participant)}
            />
            <audio
              autoPlay
              ref={(el) => {
                const pub = participant.getTrackPublication(Track.Source.Microphone);
                if (el && pub?.track) pub.track.attach(el);
              }}
            />
            <p className="absolute bottom-2 left-2 rounded-full bg-background/80 px-2 py-0.5 text-xs">
              {participant.name || "Участник"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
