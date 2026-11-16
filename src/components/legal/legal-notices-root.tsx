"use client";

import { CookieNotice } from "@/components/legal/cookie-notice";
import { FirstVisitNotice } from "@/components/legal/first-visit-notice";

/** Глобальные юридические уведомления (первый визит + cookie). */
export function LegalNoticesRoot() {
  return (
    <>
      <FirstVisitNotice />
      <CookieNotice />
    </>
  );
}
