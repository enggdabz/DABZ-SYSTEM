import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

/** Internal system: there is no public landing page. */
export default async function HomePage() {
  const current = await getCurrentUser();
  redirect(current ? "/admin" : "/login");
}
