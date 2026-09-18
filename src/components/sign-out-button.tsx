import { signOut } from "@/app/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="label-caps rounded-lg border border-line px-3 py-1.5 text-fg-muted transition hover:border-brand hover:text-brand"
      >
        Sign out
      </button>
    </form>
  );
}
