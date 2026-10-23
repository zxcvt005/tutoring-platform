import { describe, expect, it } from "vitest";

import {
  shouldDefaultDemoLogin,
  shouldSwitchDemoCabinet,
} from "@/lib/store/demo-session";

describe("demo session stability", () => {
  it("auto-logins to a default account only when there is no session", () => {
    expect(
      shouldDefaultDemoLogin({ demoLoginEnabled: true, hasSession: false })
    ).toBe(true);
    expect(
      shouldDefaultDemoLogin({ demoLoginEnabled: true, hasSession: true })
    ).toBe(false);
    expect(
      shouldDefaultDemoLogin({ demoLoginEnabled: false, hasSession: false })
    ).toBe(false);
  });

  it("does not overwrite an existing student/teacher session on refresh", () => {
    expect(
      shouldSwitchDemoCabinet({
        demoLoginEnabled: true,
        hasSession: true,
        pathRole: "student",
        sessionRole: "student",
      })
    ).toBe(false);
    expect(
      shouldSwitchDemoCabinet({
        demoLoginEnabled: true,
        hasSession: true,
        pathRole: "teacher",
        sessionRole: "teacher",
      })
    ).toBe(false);
  });

  it("switches cabinet when the user opens another role with demo login on", () => {
    expect(
      shouldSwitchDemoCabinet({
        demoLoginEnabled: true,
        hasSession: true,
        pathRole: "teacher",
        sessionRole: "student",
      })
    ).toBe(true);
  });

  it("does not switch cabinets from filters when demo login is off", () => {
    expect(
      shouldSwitchDemoCabinet({
        demoLoginEnabled: false,
        hasSession: true,
        pathRole: "teacher",
        sessionRole: "student",
      })
    ).toBe(false);
  });
});
