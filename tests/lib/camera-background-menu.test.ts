import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  CAMERA_BACKGROUND_MENU_SECTIONS,
  cameraBackgroundMenuOpenStartsProcessing,
  dropdownMenuLabelsAreGrouped,
} from "@/lib/video/camera-background-menu";
import { CAMERA_BACKGROUND_IMAGES } from "@/lib/video/camera-background";
import type { CameraBackgroundChoice } from "@/lib/video/camera-background";

const pickerSource = readFileSync(
  path.join(
    process.cwd(),
    "src/components/video-calls/camera-background-picker.tsx"
  ),
  "utf8"
);

describe("camera background menu Base UI structure", () => {
  it("wraps every DropdownMenuLabel in DropdownMenuGroup (error #31)", () => {
    expect(dropdownMenuLabelsAreGrouped(pickerSource)).toBe(true);
    expect(pickerSource).toContain("DropdownMenuGroup");
    expect(pickerSource.match(/<DropdownMenuLabel\b/g)?.length).toBe(2);
  });

  it("rejects labels rendered outside a group", () => {
    const bad = `
      <DropdownMenuContent>
        <DropdownMenuLabel>Фон</DropdownMenuLabel>
        <DropdownMenuItem>x</DropdownMenuItem>
      </DropdownMenuContent>
    `;
    expect(dropdownMenuLabelsAreGrouped(bad)).toBe(false);
  });

  it("keeps expected sections and image choices", () => {
    expect(CAMERA_BACKGROUND_MENU_SECTIONS[0]?.itemKeys).toEqual([
      "off",
      "blur",
    ]);
    expect(CAMERA_BACKGROUND_MENU_SECTIONS[1]?.itemKeys).toEqual(
      CAMERA_BACKGROUND_IMAGES.map((image) => image.id)
    );
    for (const section of CAMERA_BACKGROUND_MENU_SECTIONS) {
      expect(pickerSource).toContain(section.label);
    }
  });

  it("does not start video processing on menu open — only onSelect", () => {
    expect(cameraBackgroundMenuOpenStartsProcessing()).toBe(false);
    expect(pickerSource).not.toMatch(/onOpenChange=\{[^}]*onSelect/);
    // Selections are wired only through explicit onClick handlers.
    expect(pickerSource).toMatch(
      /onClick=\{\(\) => onSelect\(\{ type: "off" \}\)\}/
    );
    expect(pickerSource).toMatch(
      /onClick=\{\(\) => onSelect\(\{ type: "blur" \}\)\}/
    );
    expect(pickerSource).toMatch(
      /onClick=\{\(\) => onSelect\(\{ type: "image", id: image\.id \}\)\}/
    );
  });

  it("maps menu choices to the controller contract", () => {
    const seen: CameraBackgroundChoice[] = [];
    const onSelect = (choice: CameraBackgroundChoice) => {
      seen.push(choice);
    };
    onSelect({ type: "off" });
    onSelect({ type: "blur" });
    onSelect({ type: "image", id: "background1" });
    expect(seen).toEqual([
      { type: "off" },
      { type: "blur" },
      { type: "image", id: "background1" },
    ]);
    // Opening alone never pushes a choice.
    const openOnly = vi.fn();
    expect(openOnly).not.toHaveBeenCalled();
  });
});
