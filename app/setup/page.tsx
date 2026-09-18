import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  let alreadySetUp = false;
  let configError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (error) throw error;
    alreadySetUp = data.users.length > 0;
  } catch (error) {
    configError = (error as Error).message;
  }

  if (configError) {
    return (
      <main>
        <h1>Setup unavailable</h1>
        <div className="error">{configError}</div>
      </main>
    );
  }

  if (alreadySetUp) {
    return (
      <main>
        <h1>Setup is closed</h1>
        <p className="muted">
          An account already exists, so this page is permanently closed.
        </p>
        <div className="panel">
          <Link href="/login">Go to sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Create the owner account</h1>
      <p className="muted">
        This runs once. After an account exists, this page closes itself for
        good.
      </p>
      <SetupForm />
    </main>
  );
}
