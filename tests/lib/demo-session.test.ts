import { describe, expect, it } from "vitest";

import {
  clearDemoSkipAutoLogin,
  createSerialAsyncQueue,
  demoSessionBootKey,
  hasDemoSkipAutoLogin,
  isDemoPublicPath,
  rememberDemoExplicitLogout,
  shouldDefaultDemoLogin,
  shouldSwitchDemoCabinet,
} from "@/lib/store/demo-session";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

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

  it("does not auto-login after an explicit logout until skip is cleared", () => {
    const storage = memoryStorage();
    rememberDemoExplicitLogout(storage);
    expect(hasDemoSkipAutoLogin(storage)).toBe(true);
    expect(
      shouldDefaultDemoLogin({
        demoLoginEnabled: true,
        hasSession: false,
        skipAutoLogin: hasDemoSkipAutoLogin(storage),
      })
    ).toBe(false);
    clearDemoSkipAutoLogin(storage);
    expect(hasDemoSkipAutoLogin(storage)).toBe(false);
    expect(
      shouldDefaultDemoLogin({
        demoLoginEnabled: true,
        hasSession: false,
        skipAutoLogin: hasDemoSkipAutoLogin(storage),
      })
    ).toBe(true);
  });

  it("still switches cabinets when a demo session already exists", () => {
    expect(
      shouldSwitchDemoCabinet({
        demoLoginEnabled: true,
        hasSession: true,
        pathRole: "press",
        sessionRole: "director",
      })
    ).toBe(true);
    expect(
      shouldDefaultDemoLogin({
        demoLoginEnabled: true,
        hasSession: true,
        skipAutoLogin: true,
      })
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

  it("keeps one boot key for all pages of the same cabinet", () => {
    expect(demoSessionBootKey("/auditoria")).toBe("student");
    expect(demoSessionBootKey("/auditoria/homework")).toBe("student");
    expect(demoSessionBootKey("/auditoria/history/abc")).toBe("student");
    expect(demoSessionBootKey("/kafedra/feedback/sch_s12")).toBe("teacher");
    expect(demoSessionBootKey("/login")).toBe("public");
    expect(demoSessionBootKey("/")).toBe("public");
    expect(demoSessionBootKey("/demo/student")).toBe("public");
    expect(demoSessionBootKey("/demo/student/homework")).toBe("public");
    expect(demoSessionBootKey("/direkciya/students")).toBe("director");
  });

  it("treats private-call guest and host paths as public (no platform login redirect)", () => {
    expect(isDemoPublicPath("/join")).toBe(true);
    expect(isDemoPublicPath("/join/abc123")).toBe(true);
    expect(isDemoPublicPath("/join/abc123/extra")).toBe(true);
    expect(isDemoPublicPath("/private-calls")).toBe(true);
    expect(isDemoPublicPath("/private-calls/")).toBe(true);
    expect(isDemoPublicPath("/private-calls/settings")).toBe(true);

    expect(demoSessionBootKey("/join/invite-code")).toBe("public");
    expect(demoSessionBootKey("/join")).toBe("public");
    expect(demoSessionBootKey("/private-calls")).toBe("public");
    expect(demoSessionBootKey("/private-calls/")).toBe("public");

    // Не открывает кабинеты и чужие зоны
    expect(demoSessionBootKey("/direkciya")).toBe("director");
    expect(demoSessionBootKey("/kafedra/calls")).toBe("teacher");
    expect(demoSessionBootKey("/auditoria/calls")).toBe("student");
    expect(demoSessionBootKey("/pressa")).toBe("press");
    expect(demoSessionBootKey("/assistent")).toBe("assistant");
    expect(isDemoPublicPath("/direkciya")).toBe(false);
    expect(isDemoPublicPath("/kafedra")).toBe(false);
    expect(isDemoPublicPath("/auditoria")).toBe(false);
    // Похожие имена не считаются public
    expect(isDemoPublicPath("/joining")).toBe(false);
    expect(isDemoPublicPath("/private-calls-admin")).toBe(false);
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

  it("runs queued work in start order even if a later task finishes first", async () => {
    const enqueue = createSerialAsyncQueue();
    const order: string[] = [];
    const slow = enqueue(async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push("slow");
      return "slow";
    });
    const fast = enqueue(async () => {
      order.push("fast");
      return "fast";
    });
    await expect(Promise.all([slow, fast])).resolves.toEqual(["slow", "fast"]);
    expect(order).toEqual(["slow", "fast"]);
  });

  it("lets the latest cabinet login win after a slower previous login", async () => {
    const enqueue = createSerialAsyncQueue();
    let session = "none";
    const teacher = enqueue(async () => {
      await new Promise((r) => setTimeout(r, 25));
      session = "teacher";
    });
    const student = enqueue(async () => {
      session = "student";
    });
    await Promise.all([teacher, student]);
    expect(session).toBe("student");
  });
});
