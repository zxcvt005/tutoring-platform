import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { recordConsentBundle } from "@/server/services/legal-consents-service";

const bodySchema = z.object({
  source: z.enum([
    "first_visit",
    "cookie_banner",
    "cookie_settings",
    "landing_lead",
    "register_student",
    "invite_accept",
    "checkout",
    "settings",
  ]),
  privacyAck: z.boolean().optional(),
  personalData: z.boolean().optional(),
  marketing: z.boolean().nullable().optional(),
  publicOffer: z.boolean().optional(),
  cookie: z
    .object({
      analytics: z.boolean(),
      marketing: z.boolean(),
    })
    .nullable()
    .optional(),
  siteLeadId: z.string().max(80).nullable().optional(),
  contactRaw: z.string().max(200).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    if (
      !body.privacyAck &&
      !body.personalData &&
      body.marketing == null &&
      !body.publicOffer &&
      !body.cookie
    ) {
      throw validationError("Нет данных согласия для записи");
    }
    const ctx = await requireAuth(request).catch(() => null);
    const result = await recordConsentBundle(getDb(), ctx, {
      source: body.source,
      privacyAck: body.privacyAck,
      personalData: body.personalData,
      marketing: body.marketing,
      publicOffer: body.publicOffer,
      cookie: body.cookie,
      siteLeadId: body.siteLeadId,
      contactRaw: body.contactRaw,
      organizationId: ctx?.organizationId ?? null,
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
