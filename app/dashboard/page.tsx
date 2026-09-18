import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main>
      <h1>Signed in</h1>
      <p className="muted">The Supabase round trip works.</p>

      <div className="panel">
        <div>
          <strong>{user.email}</strong>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>{user.id}</div>
      </div>

      <form action="/auth/signout" method="post" style={{ marginTop: 16 }}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
