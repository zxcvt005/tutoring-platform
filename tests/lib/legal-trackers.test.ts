import { describe, expect, it } from "vitest";

import {
  connectedOptionalTrackers,
  hasConnectedOptionalTrackers,
  TRACKERS,
} from "@/lib/legal/trackers";
import {
  CORE_LEGAL_DOCUMENTS,
  LEGAL_DOCUMENTS,
  LEGAL_OPERATOR_EMAIL,
} from "@/lib/legal/documents";
import { landingRequisites } from "@/lib/landing/requisites";

describe("legal trackers registry", () => {
  it("does not invent connected optional trackers", () => {
    expect(hasConnectedOptionalTrackers()).toBe(false);
    expect(connectedOptionalTrackers()).toEqual([]);
    expect(TRACKERS.every((t) => t.connected === false)).toBe(true);
  });
});

describe("core legal documents", () => {
  it("exposes three approved source documents", () => {
    expect(CORE_LEGAL_DOCUMENTS).toHaveLength(3);
    expect(CORE_LEGAL_DOCUMENTS.every((d) => d.available)).toBe(true);
    expect(LEGAL_DOCUMENTS["privacy-policy"].pdfPath).toBe(
      "/legal/privacy-policy.pdf"
    );
  });

  it("keeps operator email aligned across legal docs and requisites", () => {
    expect(LEGAL_OPERATOR_EMAIL).toBe("zxcvt005@gmail.com");
    expect(landingRequisites.email).toBe(LEGAL_OPERATOR_EMAIL);
  });
});
