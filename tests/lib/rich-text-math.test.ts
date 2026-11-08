import { describe, expect, it } from "vitest";

import {
  EMPTY_EXPLANATION_MESSAGE,
  escapeHtml,
  formatKimNumber,
  normalizeKimNumber,
  splitRichTextMath,
  textSegmentToHtml,
} from "@/lib/math/rich-text-math";

describe("rich text math", () => {
  it("splits inline and display latex without executing html", () => {
    const segments = splitRichTextMath(
      'Текст <script>alert(1)</script> и \\(v_0\\) затем\n\\[v=\\frac{2S}{t}-v_0\\]'
    );
    expect(segments).toEqual([
      { kind: "text", value: "Текст <script>alert(1)</script> и " },
      { kind: "math", value: "v_0", display: false },
      { kind: "text", value: " затем\n" },
      { kind: "math", value: "v=\\frac{2S}{t}-v_0", display: true },
    ]);
    expect(textSegmentToHtml(segments[0]!.value as string)).toContain(
      "&lt;script&gt;"
    );
    expect(textSegmentToHtml(segments[0]!.value as string)).not.toContain(
      "<script>"
    );
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });

  it("keeps empty explanation message stable", () => {
    expect(EMPTY_EXPLANATION_MESSAGE).toBe("Тут пока ничего нет :(");
  });

  it("normalizes optional KIM numbers", () => {
    expect(normalizeKimNumber("12")).toBe(12);
    expect(normalizeKimNumber("")).toBeUndefined();
    expect(normalizeKimNumber(null)).toBeUndefined();
    expect(normalizeKimNumber(0)).toBeUndefined();
    expect(formatKimNumber(3)).toBe("№ 3");
    expect(formatKimNumber(null)).toBe("Без номера КИМ");
  });
});
