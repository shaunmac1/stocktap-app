import { describe, it, expect } from "vitest";
import { addFault, buildFault, cleanRoute, isNoise, type Fault } from "./fault-report";

const ctx = { href: "https://stocktap.net/stocktake?view=abc&name=Gordons", build: "AbC123", online: false, venueId: "v1", now: new Date("2026-11-12T08:00:00Z") };

describe("fault reporting", () => {
  it("no signal is not a fault", () => {
    for (const m of ["Failed to fetch", "TypeError: Load failed", "NetworkError when attempting to fetch resource.", "signal timed out", "ResizeObserver loop limit exceeded", "", "  "]) {
      expect(isNoise(m)).toBe(true);
      expect(buildFault("promise", new Error(m), ctx)).toBeNull();
    }
  });
  it("a real fault is kept with screen, version and signal, and nothing the user typed", () => {
    const f = buildFault("error", new TypeError("Cannot read properties of undefined (reading 'size_ml')"), ctx)!;
    expect(f.message).toContain("size_ml");
    expect(f.route).toBe("/stocktake");
    expect(JSON.stringify(f)).not.toContain("Gordons");
    expect(f.build).toBe("AbC123");
    expect(f.online).toBe(false);
    expect(f.venue_id).toBe("v1");
    expect(f.stack!.split("\n").length).toBeLessThanOrEqual(8);
  });
  it("database errors without a stack still report their message", () => {
    const f = buildFault("sync", { message: "new row violates row-level security policy", code: "42501" }, ctx)!;
    expect(f.message).toContain("row-level security");
    expect(f.stack).toBeNull();
  });
  it("long messages are cut", () => {
    expect(buildFault("error", new Error("x".repeat(5000)), ctx)!.message.length).toBe(400);
  });
  it("the same fault inside 10 minutes is noted once; later it counts again", () => {
    const a = buildFault("error", new Error("boom"), ctx)!;
    let l: Fault[] = addFault([], a);
    l = addFault(l, { ...a, happened_at: "2026-11-12T08:05:00.000Z" });
    expect(l.length).toBe(1);
    l = addFault(l, { ...a, happened_at: "2026-11-12T08:11:00.000Z" });
    expect(l.length).toBe(2);
    l = addFault(l, { ...a, kind: "sync", happened_at: "2026-11-12T08:11:30.000Z" });
    expect(l.length).toBe(3);
  });
  it("never keeps more than 30 on the phone", () => {
    let l: Fault[] = [];
    for (let i = 0; i < 50; i++) l = addFault(l, buildFault("error", new Error("e" + i), ctx)!);
    expect(l.length).toBe(30);
    expect(l[29].message).toBe("e49");
  });
  it("routes lose their query", () => {
    expect(cleanRoute("https://stocktap.net/count?done=1")).toBe("/count");
    expect(cleanRoute("not a url %%")).toMatch(/^\//);
  });
});
