import { describe, expect, it, vi } from "vitest";
import { ConnectionState } from "livekit-client";

import {
  isConnectedState,
  isDisconnectedState,
  isTransientConnectionState,
  roomNeedsRecreate,
  waitForRoomSettled,
} from "@/lib/video/room-lifecycle";

function fakeRoom(initial: ConnectionState) {
  let state = initial;
  const listeners = new Map<string, Set<(s: ConnectionState) => void>>();
  return {
    get state() {
      return state;
    },
    on(event: string, cb: (s: ConnectionState) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off(event: string, cb: (s: ConnectionState) => void) {
      listeners.get(event)?.delete(cb);
    },
    emit(next: ConnectionState) {
      state = next;
      for (const cb of listeners.get("connectionStateChanged") ?? []) {
        cb(next);
      }
    },
  };
}

describe("room-lifecycle states", () => {
  it("classifies connection states", () => {
    expect(isConnectedState(ConnectionState.Connected)).toBe(true);
    expect(isDisconnectedState(ConnectionState.Disconnected)).toBe(true);
    expect(isTransientConnectionState(ConnectionState.SignalReconnecting)).toBe(
      true
    );
    expect(isTransientConnectionState(ConnectionState.Reconnecting)).toBe(true);
    expect(isTransientConnectionState(ConnectionState.Connecting)).toBe(true);
    expect(roomNeedsRecreate({ state: ConnectionState.Disconnected } as never)).toBe(
      true
    );
    expect(roomNeedsRecreate({ state: ConnectionState.Connected } as never)).toBe(
      false
    );
    expect(
      roomNeedsRecreate({ state: ConnectionState.SignalReconnecting } as never)
    ).toBe(false);
  });

  it("waits for reconnect without treating it as failure immediately", async () => {
    const room = fakeRoom(ConnectionState.SignalReconnecting);
    const pending = waitForRoomSettled(room as never, 2000);
    await Promise.resolve();
    room.emit(ConnectionState.Connected);
    await expect(pending).resolves.toBe("connected");
  });

  it("resolves disconnected when SDK gives up", async () => {
    const room = fakeRoom(ConnectionState.Reconnecting);
    const pending = waitForRoomSettled(room as never, 2000);
    await Promise.resolve();
    room.emit(ConnectionState.Disconnected);
    await expect(pending).resolves.toBe("disconnected");
  });

  it("times out if reconnect never settles", async () => {
    vi.useFakeTimers();
    const room = fakeRoom(ConnectionState.SignalReconnecting);
    const pending = waitForRoomSettled(room as never, 500);
    const assertion = expect(pending).resolves.toBe("timeout");
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    vi.useRealTimers();
  });
});
