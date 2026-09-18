import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/** Routes that require a signed-in user, and the roles allowed to reach them. */
const PROTECTED_PREFIXES = [
  { prefix: "/admin", roles: ["owner", "admin", "staff"] as const },
  { prefix: "/portal", roles: ["owner", "admin", "staff"] as const },
];

/**
 * Refreshes the Supabase auth cookie and enforces route access.
 *
 * The response object must be the one returned — `@supabase/ssr` writes
 * refreshed cookies onto it, and dropping it silently logs users out.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
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

  // Always getUser(), never getSession(): getUser() revalidates the token with
  // Supabase, so a revoked or forged cookie cannot pass this check.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const match = PROTECTED_PREFIXES.find(
    (route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`),
  );

  if (match) {
    if (!user) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/login";
      redirect.searchParams.set("next", pathname);
      return NextResponse.redirect(redirect);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.status !== "active") {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/login";
      redirect.searchParams.set("error", "inactive");
      return NextResponse.redirect(redirect);
    }

    if (!match.roles.includes(profile.role as (typeof match.roles)[number])) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/portal";
      redirect.search = "";
      return NextResponse.redirect(redirect);
    }
  }

  // Signed-in users have no reason to see the sign-in screen.
  if (user && pathname === "/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/admin";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
