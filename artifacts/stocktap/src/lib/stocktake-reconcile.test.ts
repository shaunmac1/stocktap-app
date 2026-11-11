import { describe, it, expect } from "vitest";
import { reconcileStocktakes } from "./stocktake-reconcile";

const row = (id: string, opened: string, extra: Record<string, unknown> = {}) => ({ id, venue_id: "v", opened_at: opened, status: "closed", ...extra });

describe("the list of counts is the same on every device", () => {
  it("a count finished on the phone shows on the laptop; a stale one the server no longer has goes", () => {
    // Real case: a laptop holding two old counts, while the phone had done five since.
    const local = [row("old1", "2026-09-09", { _temp: 0 }), row("old2", "2026-09-28", { _temp: 0, status: "open" })];
    const server = [row("n1", "2026-11-05"), row("n2", "2026-11-10")];
    const r = reconcileStocktakes(local, server, new Set());
    expect(r.list.map(x => x.id)).toEqual(["n2", "n1"]);
    expect(r.remove.sort()).toEqual(["old1", "old2"]);
    expect(r.put.map(x => x.id).sort()).toEqual(["n1", "n2"]);
  });
  it("a count started with no signal and not sent yet is never lost", () => {
    const local = [row("tmp", "2026-11-11", { _temp: 1, status: "open" })];
    const r = reconcileStocktakes(local, [row("n1", "2026-11-05")], new Set());
    expect(r.list.map(x => x.id)).toEqual(["tmp", "n1"]);
    expect(r.remove).toEqual([]);
  });
  it("a count closed here but not sent yet keeps this device's version", () => {
    const local = [row("n1", "2026-11-05", { status: "closed", total_value: 123, _temp: 0 })];
    const server = [row("n1", "2026-11-05", { status: "open", total_value: null })];
    const r = reconcileStocktakes(local, server, new Set(["n1"]));
    expect(r.list[0]).toMatchObject({ status: "closed", total_value: 123 });
    expect(r.put).toEqual([]);          // don't overwrite the unsent change
    expect(r.remove).toEqual([]);
  });
  it("anything with an unsent change is kept even if the server doesn't list it", () => {
    const r = reconcileStocktakes([row("x", "2026-11-01", { _temp: 0 })], [], new Set(["x"]));
    expect(r.list.map(x => x.id)).toEqual(["x"]);
    expect(r.remove).toEqual([]);
  });
});
