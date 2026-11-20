import { describe, expect, it } from "vitest";

import { parallelWantedRoomIds } from "@/lib/video/parallel-rooms";

describe("parallelWantedRoomIds", () => {
  it("keeps only the active room", () => {
    expect(parallelWantedRoomIds("vcp_1")).toEqual(["vcp_1"]);
  });

  it("keeps no rooms while teacher is in hold", () => {
    expect(parallelWantedRoomIds(null)).toEqual([]);
    expect(parallelWantedRoomIds(undefined)).toEqual([]);
    expect(parallelWantedRoomIds("")).toEqual([]);
  });
});
