import { describe, expect, it } from "vitest";

import {
  GRAPHICS_TABLET_STATUS_LABEL,
  GRAPHICS_TABLET_STATUSES,
  isGraphicsTabletStatus,
} from "@/lib/graphics-tablets";

describe("graphics tablets helpers", () => {
  it("exposes two tablet statuses with Russian labels", () => {
    expect(GRAPHICS_TABLET_STATUSES).toEqual(["not_needed", "ordered"]);
    expect(GRAPHICS_TABLET_STATUS_LABEL.not_needed).toBe("Не нужен");
    expect(GRAPHICS_TABLET_STATUS_LABEL.ordered).toBe("Заказал");
    expect(isGraphicsTabletStatus("not_needed")).toBe(true);
    expect(isGraphicsTabletStatus("ordered")).toBe(true);
    expect(isGraphicsTabletStatus("other")).toBe(false);
  });
});
