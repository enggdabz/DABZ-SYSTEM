/**
 * Runs before every page request (Next.js calls this Proxy; it used to be
 * called Middleware).
 *
 * Two jobs:
 *   1. Keep the signed-in session fresh, by letting Supabase rotate its cookies.
 *   2. Send a signed-out visitor to the login screen.
 *
 * Deliberately NOT the security boundary. Next.js warns that this runs on
 * prefetched routes too, so it only does the cheap cookie check. The real
 * checks live in src/lib/auth/dal.ts, next to the data, and Row Level Security
 * in PostgreSQL backs them up.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Pages a signed-out visitor is allowed to open.
 *
 * "/" is the shop's public page (Phase 9) - a customer arriving from Facebook
 * must not be shown a login screen. It matches the root EXACTLY: the check
 * below is `pathname === path || pathname.startsWith(path + "/")`, and
 * "//" never matches a real path, so "/" here does not open the whole system.
 */
const PUBLIC_PATHS = ["/", "/login", "/setup"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Before Supabase is set up there is nothing to protect and no session to
  // refresh, so let every request through: the hello screen explains what to do.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes the session and writes the rotated cookies onto the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    // Remember where they were headed, so they land there after signing in.
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Somebody already signed in has no use for the login screen. They go to the
  // Overview, not to "/", which is now the shop's public page.
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  return response;
}

export const config = {
  // Skip Next's internal files and anything that looks like an image, so the
  // session check does not run on every icon.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
