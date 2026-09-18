import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** True once any account exists. The setup route closes itself permanently after that. */
async function ownerExists(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (error) throw error;
  return data.users.length > 0;
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    // Missing env var -- surface the readable message from lib/env.ts.
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }

  let email: string;
  let password: string;
  try {
    const body = await request.json();
    email = String(body.email ?? "").trim();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are both required." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  try {
    if (await ownerExists(admin)) {
      return NextResponse.json(
        { error: "Setup is already complete. Sign in instead." },
        { status: 409 }
      );
    }

    // email_confirm skips the confirmation mail entirely, so the owner can sign
    // in immediately without depending on the project's SMTP setup.
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
