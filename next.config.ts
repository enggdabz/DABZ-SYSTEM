import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
      How long a screen already visited may be reused when the person comes
      back to it, in seconds.

      Every screen here is dynamic, and the default for a dynamic screen is 0 -
      nothing is kept at all, so tapping Bills, then Ledger, then Bills again
      fetched Bills twice from scratch. Thirty seconds covers the way the
      counter is actually used, which is darting between two or three sections
      while dealing with one customer.

      It cannot show stale money: a Server Action that changes anything calls
      `revalidatePath` for the screens it affects, which throws this cache away
      for those paths. What the window CAN hold back is a change somebody else
      made on another machine in the last half minute - and a screen left open
      is already older than that, so this is not a new way to be wrong.

      To turn it off, set `dynamic: 0` - screens go back to being fetched on
      every single visit.
    */
    staleTimes: {
      dynamic: 30,
    },

    /*
      How big a Server Action's request body may be.

      Next's own default is 1MB, and three uploads in this system go through a
      Server Action rather than a route handler: a customer's artwork (20MB),
      a product photo and a design mockup (5MB each). Left at the default,
      every one of those is refused by the framework BEFORE the action runs -
      so the size check in `src/lib/online/uploads.ts` never sees the bytes,
      the content sniffing never happens, and a customer attaching a photo
      straight off their phone gets an error with nothing in it.

      21MB rather than 20: the limit is on the RAW body, and multipart adds
      boundaries and part headers on top of the file itself. The real ceiling
      stays in `UPLOAD_LIMITS`, which is what answers the person in words.

      This is deliberately the only knob Next offers, so it applies to every
      action in the app and not just the three. What stops a 20MB write of
      anything else is that each action checks its own input.
    */
    serverActions: {
      bodySizeLimit: "21mb",
    },
  },

  /*
    `/shop` is where the online catalogue lived until 22 September 2026, when
    the owner asked for it to be the homepage. Every link already handed out -
    a Facebook post, a Messenger reply, a printed receipt, a QR code on a
    tarpaulin - points at the old address, so it still answers.

    ONLY the catalogue moved. `/shop/products/...`, `/shop/designs`,
    `/shop/order` and `/shop/track` are all where they were: a `source` of
    "/shop" matches that one path exactly and nothing under it. Moving those to
    the root as well would have collided with the staff screen at `/products`,
    which is a different list for a different person.

    Temporary (307) rather than permanent, deliberately. A permanent redirect
    is cached by the customer's own browser more or less for ever, and this is
    a decision about the shape of the site that the owner may want to look at
    again - see `docs/DECISIONS.md`. The cost is a little search-engine credit
    left on the old address; the cost of the other choice is a customer whose
    phone will not let go of it.
  */
  async redirects() {
    return [{ source: "/shop", destination: "/", permanent: false }];
  },

  /*
    Product photos and jersey mockups live in Supabase Storage, so next/image
    has to be told that host is allowed to serve them.

    Matched by the shape of a Supabase URL rather than by reading
    NEXT_PUBLIC_SUPABASE_URL here: this file is read at BUILD time, the CI
    build deliberately runs with no Supabase credentials at all, and a pattern
    list built from a missing variable would be empty - which fails at
    runtime, in production, on a page nobody looked at in CI.

    Only the public read path, and only the two public buckets' prefix. A
    self-hosted Supabase on another domain is the one case that needs a line
    adding here.
  */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
