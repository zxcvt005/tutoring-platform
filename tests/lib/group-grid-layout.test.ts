import { describe, expect, it } from "vitest";

import {
  groupStudentColumns,
  groupStudentPageSize,
  groupStudentPages,
  resolveGroupViewport,
  sliceStudentPage,
} from "@/lib/video/group-grid-layout";

describe("group-grid-layout", () => {
  it("caps page size so cameras stay readable", () => {
    expect(groupStudentPageSize(2, "desktop")).toBe(2);
    expect(groupStudentPageSize(10, "desktop")).toBe(8);
    expect(groupStudentPageSize(10, "mobile")).toBe(4);
  });

  it("picks even column counts for common group sizes", () => {
    expect(groupStudentColumns(1, "desktop")).toBe(1);
    expect(groupStudentColumns(2, "desktop")).toBe(2);
    expect(groupStudentColumns(3, "desktop")).toBe(3);
    expect(groupStudentColumns(4, "desktop")).toBe(2);
    expect(groupStudentColumns(6, "desktop")).toBe(3);
    expect(groupStudentColumns(8, "desktop")).toBe(4);
    expect(groupStudentColumns(3, "mobile")).toBe(2);
  });

  it("paginates overflow students", () => {
    expect(groupStudentPages(10, "desktop")).toBe(2);
    expect(groupStudentPages(10, "mobile")).toBe(3);
    expect(sliceStudentPage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, "desktop")).toEqual([
      9, 10,
    ]);
  });

  it("resolves viewport breakpoints", () => {
    expect(resolveGroupViewport(390)).toBe("mobile");
    expect(resolveGroupViewport(800)).toBe("tablet");
    expect(resolveGroupViewport(1280)).toBe("desktop");
  });
});
