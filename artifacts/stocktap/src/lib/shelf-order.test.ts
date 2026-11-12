import { describe, expect, it } from "vitest";
import { readShelfOrder, shelfComparator } from "./shelf-order";

const p = (id: string, name: string) => ({ id, name });
describe("shelf order", () => {
  it("lines on the shelf list come first, in shelf order", () => {
    const list = [p("a", "Apple"), p("b", "Bulmers"), p("m", "Mango"), p("t", "Thatchers")];
    expect(list.sort(shelfComparator(["m", "b", "t"])).map(x => x.id)).toEqual(["m", "b", "t", "a"]);
  });
  it("lines not on the list follow by name", () => {
    const list = [p("z", "Zed"), p("c", "Corona"), p("a", "Appletiser")];
    expect(list.sort(shelfComparator(["z"])).map(x => x.id)).toEqual(["z", "a", "c"]);
  });
  it("no saved order is plain A to Z", () => {
    const list = [p("b", "B"), p("a", "A")];
    expect(list.sort(shelfComparator([])).map(x => x.id)).toEqual(["a", "b"]);
  });
  it("reads the saved list and ignores rubbish", () => {
    expect(readShelfOrder({ count_order: ["a", 3, null, "b"] })).toEqual(["a", "b"]);
    expect(readShelfOrder({})).toEqual([]);
    expect(readShelfOrder(null)).toEqual([]);
  });
});
