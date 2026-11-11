/**
 * Structural helpers for the virtual-background dropdown.
 * Kept free of React so Node vitest can verify Base UI Menu group rules.
 */

export type CameraBackgroundMenuSection = {
  label: string;
  itemKeys: readonly string[];
};

/** Expected menu sections — labels must render inside Menu.Group. */
export const CAMERA_BACKGROUND_MENU_SECTIONS: readonly CameraBackgroundMenuSection[] =
  [
    {
      label: "Фон камеры",
      itemKeys: ["off", "blur"],
    },
    {
      label: "Готовые фоны",
      itemKeys: [
        "background1",
        "background2",
        "background3",
        "background4",
        "background5",
        "background6",
        "background7",
      ],
    },
  ];

/**
 * Base UI Menu.GroupLabel requires a Menu.Group ancestor.
 * Returns false if any label is not nested in a group in the JSX source.
 */
export function dropdownMenuLabelsAreGrouped(source: string): boolean {
  // Strip block comments so commented examples do not count.
  const cleaned = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const labelRe = /<DropdownMenuLabel\b/g;
  let match: RegExpExecArray | null;
  let labels = 0;
  while ((match = labelRe.exec(cleaned))) {
    labels += 1;
    const before = cleaned.slice(0, match.index);
    const lastGroupOpen = before.lastIndexOf("<DropdownMenuGroup");
    const lastGroupClose = before.lastIndexOf("</DropdownMenuGroup>");
    if (lastGroupOpen < 0 || lastGroupOpen < lastGroupClose) {
      return false;
    }
  }
  return labels > 0;
}

/** Opening the menu must not emit a selection by itself. */
export function cameraBackgroundMenuOpenStartsProcessing(): boolean {
  return false;
}
