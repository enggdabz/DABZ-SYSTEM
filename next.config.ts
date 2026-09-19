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
  },
};

export default nextConfig;
