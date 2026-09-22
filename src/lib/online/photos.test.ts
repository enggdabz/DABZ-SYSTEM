import { describe, expect, it } from "vitest";

import { canMovePhoto, isSameSet, movePhoto } from "./photos";

const PHOTOS = ["a", "b", "c", "d"];

describe("moving a photo", () => {
  it("swaps with the one before it", () => {
    expect(movePhoto(PHOTOS, "c", "up")).toEqual(["a", "c", "b", "d"]);
  });

  it("swaps with the one after it", () => {
    expect(movePhoto(PHOTOS, "b", "down")).toEqual(["a", "c", "b", "d"]);
  });

  /*
    The move that matters: the first photo is the picture on the card, and
    asking somebody to tap "move left" four times to change it is how a shop
    ends up with the wrong main picture.
  */
  it("takes a photo to the front in one move", () => {
    expect(movePhoto(PHOTOS, "d", "first")).toEqual(["d", "a", "b", "c"]);
  });

  it("keeps every photo, and only moves one", () => {
    const moved = movePhoto(PHOTOS, "d", "first");
    expect([...moved].sort()).toEqual([...PHOTOS].sort());
    expect(moved).toHaveLength(PHOTOS.length);
  });

  it("never mutates the list it was given", () => {
    const original = [...PHOTOS];
    movePhoto(PHOTOS, "a", "down");
    expect(PHOTOS).toEqual(original);
  });
});

describe("a move that cannot happen", () => {
  /*
    Returning the list unchanged rather than throwing is deliberate: a caller
    that gets the same order back has asked for nothing, and sending "nothing"
    to the database is the correct next step.
  */
  it("leaves the first photo alone when asked to move it up", () => {
    expect(movePhoto(PHOTOS, "a", "up")).toEqual(PHOTOS);
    expect(movePhoto(PHOTOS, "a", "first")).toEqual(PHOTOS);
  });

  it("leaves the last photo alone when asked to move it down", () => {
    expect(movePhoto(PHOTOS, "d", "down")).toEqual(PHOTOS);
  });

  it("ignores a photo that is not in the list", () => {
    expect(movePhoto(PHOTOS, "zzz", "first")).toEqual(PHOTOS);
  });

  it("copes with a single photo, which is every shop's first product", () => {
    expect(movePhoto(["only"], "only", "up")).toEqual(["only"]);
    expect(movePhoto(["only"], "only", "down")).toEqual(["only"]);
    expect(canMovePhoto(["only"], "only", "up")).toBe(false);
    expect(canMovePhoto(["only"], "only", "down")).toBe(false);
  });

  it("copes with no photos at all", () => {
    expect(movePhoto([], "a", "up")).toEqual([]);
    expect(canMovePhoto([], "a", "first")).toBe(false);
  });
});

describe("which buttons to draw", () => {
  it("offers nothing backwards on the first photo", () => {
    expect(canMovePhoto(PHOTOS, "a", "up")).toBe(false);
    expect(canMovePhoto(PHOTOS, "a", "first")).toBe(false);
    expect(canMovePhoto(PHOTOS, "a", "down")).toBe(true);
  });

  it("offers nothing forwards on the last photo", () => {
    expect(canMovePhoto(PHOTOS, "d", "down")).toBe(false);
    expect(canMovePhoto(PHOTOS, "d", "up")).toBe(true);
    expect(canMovePhoto(PHOTOS, "d", "first")).toBe(true);
  });

  /*
    A button is drawn only where the move does something, and `movePhoto`
    returns the list unchanged everywhere a button is not drawn. If those two
    ever disagreed, a button would be there and do nothing.
  */
  it("agrees with what the move actually does, for every photo", () => {
    for (const id of PHOTOS) {
      for (const move of ["up", "down", "first"] as const) {
        const changed = movePhoto(PHOTOS, id, move).join() !== PHOTOS.join();
        expect(canMovePhoto(PHOTOS, id, move)).toBe(changed);
      }
    }
  });
});

describe("checking a proposed order before sending it", () => {
  it("accepts a rearrangement", () => {
    expect(isSameSet(PHOTOS, ["d", "c", "b", "a"])).toBe(true);
  });

  it("accepts the same order", () => {
    expect(isSameSet(PHOTOS, PHOTOS)).toBe(true);
  });

  /*
    A short list is the dangerous one: the database renumbers what it is given
    and leaves everything else at whatever number it had, so the photos left
    out would interleave with the new ones. Neither the old order nor the one
    asked for.
  */
  it("refuses a list with a photo missing", () => {
    expect(isSameSet(PHOTOS, ["a", "b", "c"])).toBe(false);
  });

  it("refuses a list with something extra in it", () => {
    expect(isSameSet(PHOTOS, ["a", "b", "c", "d", "e"])).toBe(false);
  });

  it("refuses a photo from another product", () => {
    expect(isSameSet(PHOTOS, ["a", "b", "c", "somebody-elses"])).toBe(false);
  });

  it("refuses the same photo twice, even at the right length", () => {
    expect(isSameSet(PHOTOS, ["a", "a", "b", "c"])).toBe(false);
  });

  it("accepts nothing against nothing", () => {
    expect(isSameSet([], [])).toBe(true);
  });
});
