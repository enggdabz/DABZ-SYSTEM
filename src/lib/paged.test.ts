import { describe, expect, it } from "vitest";

import { PAGE_SIZE, readPaged, type PageReader } from "./paged";

/** A fake table that, like PostgREST, never returns more than PAGE_SIZE rows. */
function table(size: number) {
  const calls: Array<[number, number]> = [];
  const read: PageReader<number> = async (from, to) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + PAGE_SIZE, size);
    return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i), error: null };
  };
  return { read, calls };
}

describe("readPaged", () => {
  it("reads past the 1,000-row cap that a single request stops at", async () => {
    const { read } = table(2500);
    const { rows, error } = await readPaged(read, 5000);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2500);
    // Every row once, in order: no page overlaps and none is skipped.
    expect(rows).toEqual(Array.from({ length: 2500 }, (_, i) => i));
  });

  it("stops at the limit it was given", async () => {
    const { read, calls } = table(5000);
    const { rows } = await readPaged(read, 1500);
    expect(rows).toHaveLength(1500);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1499],
    ]);
  });

  it("asks once for a small table", async () => {
    const { read, calls } = table(12);
    const { rows } = await readPaged(read, 200);
    expect(rows).toHaveLength(12);
    expect(calls).toHaveLength(1);
  });

  it("asks for one more page when the table ends exactly on a page break", async () => {
    const { read, calls } = table(2000);
    const { rows } = await readPaged(read, 5000);
    expect(rows).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it("fails the whole read when any page fails, rather than returning half", async () => {
    let page = 0;
    const read: PageReader<number> = async () => {
      page += 1;
      return page === 2
        ? { data: null, error: { message: "boom" } }
        : { data: Array.from({ length: PAGE_SIZE }, () => 1), error: null };
    };
    const { rows, error } = await readPaged(read, 5000);
    expect(rows).toEqual([]);
    expect(error).toEqual({ message: "boom" });
  });
});
