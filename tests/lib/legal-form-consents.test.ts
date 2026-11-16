import { describe, expect, it } from "vitest";

import {
  emptyFormConsentState,
  validateRequiredFormConsents,
} from "@/components/legal/form-consent-fields";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

describe("form consents", () => {
  it("requires personal data consent", () => {
    expect(validateRequiredFormConsents(emptyFormConsentState())).toEqual({
      personalData: expect.any(String),
    });
  });

  it("requires offer only when available and requested", () => {
    const withPd = { ...emptyFormConsentState(), personalData: true };
    expect(validateRequiredFormConsents(withPd)).toEqual({});
    expect(
      validateRequiredFormConsents(withPd, { requireOffer: true })
    ).toEqual({
      publicOffer: expect.any(String),
    });
  });

  it("marks public offer as unavailable until source is provided", () => {
    expect(LEGAL_DOCUMENTS["public-offer"].available).toBe(false);
    expect(LEGAL_DOCUMENTS["public-offer"].path).toBe("/legal/offer");
  });
});

