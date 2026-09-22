/**
 * Which addresses a signed-out visitor may open.
 *
 * Its own file, with its own tests, because getting it wrong is silent and
 * total: a page left off this list sends every customer who taps a link from
 * Facebook to a staff login screen, and it does so only once Supabase is
 * configured - so it works perfectly on a machine with no credentials and
 * fails on the day it goes live.
 *
 * The rule is narrow on purpose. `/` matches the root EXACTLY plus anything
 * under `/` written as `//`, which is never a real path - so listing the root
 * does not open the whole system.
 */
export const PUBLIC_PATHS = [
  // The shop's public page (Phase 9). A customer arriving from Facebook must
  // not be shown a login screen.
  "/",
  "/login",
  "/setup",
  // The online shop (Phase 14): the catalogue, a product, the order, the
  // checkout, the receipt and track-my-order. Every one of them is for
  // somebody who is nobody, and the writes behind them are validated and
  // rate-limited in the Server Actions rather than guarded here.
  "/shop",
  /*
    The route handlers. Both of them are crons that check a shared secret
    themselves and fail shut without one, so the proxy has nothing to add -
    and a redirect to a login page is a useless answer to a machine, which
    would read as a 200 with an HTML body and quietly never run.
  */
  "/api",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
