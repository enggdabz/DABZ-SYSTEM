/**
 * The link that opens a chat with the Dabz Apparel Page (docs/store/progress.md).
 *
 * `https://m.me/<page>?ref=<value>` opens Messenger with the Page, and Meta
 * hands the `ref` back to the shop's webhook when the customer starts the
 * chat - which is how a conversation gets tied to a product or an order.
 *
 * Nothing here talks to Meta. It builds a URL, and refuses to build one from
 * anything that is not a plausible Page username: this string ends up in an
 * `href` on a page a stranger reads, so it is checked rather than trusted.
 */

// Facebook usernames: letters, digits and dots. Anything else is not one.
const PAGE_USERNAME = /^[A-Za-z0-9.]{5,50}$/;

// Meta's own rule for a ref: a-z A-Z 0-9 + / = - . : _ and at most 250 chars.
// Kept narrower than that - no slash, plus or colon - because ours are ids.
const REF_UNSAFE = /[^A-Za-z0-9=_.-]/g;

export function cleanRef(ref: string): string {
  return ref.replace(REF_UNSAFE, "").slice(0, 250);
}

export function messengerLink(
  pageUsername: string | null | undefined,
  ref?: string,
): string | null {
  const name = (pageUsername ?? "").trim().replace(/^@/, "");
  if (!PAGE_USERNAME.test(name)) return null;

  const cleaned = ref ? cleanRef(ref) : "";
  const base = `https://m.me/${name}`;
  return cleaned ? `${base}?ref=${cleaned}` : base;
}

/** The ref a product page sends, so the chat opens knowing which product. */
export function productRef(productId: string): string {
  return cleanRef(`product_${productId}`);
}
