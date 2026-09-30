import { describe, expect, it } from "vitest";

import { cleanRef, messengerLink, productRef } from "./messenger";

describe("messengerLink", () => {
  it("builds an m.me link with a ref", () => {
    expect(messengerLink("DabzApparel", "product_123")).toBe(
      "https://m.me/DabzApparel?ref=product_123",
    );
  });

  it("builds a bare link without a ref, and forgives a leading @", () => {
    expect(messengerLink("@DabzApparel")).toBe("https://m.me/DabzApparel");
  });

  it("builds nothing when the Page name has not been set", () => {
    expect(messengerLink(null)).toBeNull();
    expect(messengerLink("")).toBeNull();
  });

  it("refuses anything that is not a plausible Page username", () => {
    // This string lands in an href on a page a stranger reads.
    expect(messengerLink('evil"onmouseover="x')).toBeNull();
    expect(messengerLink("a b c d e f")).toBeNull();
    expect(messengerLink("https://evil.example/x")).toBeNull();
    expect(messengerLink("abc")).toBeNull();
  });

  it("strips characters a ref may not carry, and caps it", () => {
    expect(cleanRef("DA-0001&x=1#frag")).toBe("DA-0001x=1frag");
    expect(cleanRef("x".repeat(400))).toHaveLength(250);
    expect(productRef("0b1c-22")).toBe("product_0b1c-22");
  });
});
