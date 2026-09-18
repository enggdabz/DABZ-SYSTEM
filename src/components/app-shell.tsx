import { MobileNav, Sidebar } from "@/components/sidebar";
import { SignOutButton } from "@/components/sign-out-button";
import { modulesFor } from "@/lib/modules";
import type { AppRole } from "@/lib/types/app";

export function AppShell({
  title,
  role,
  username,
  fullName,
  children,
}: {
  title: string;
  role: AppRole;
  username: string;
  fullName: string;
  children: React.ReactNode;
}) {
  const items = modulesFor(role).map(({ key, href, short, ready }) => ({
    key,
    href,
    short,
    ready,
  }));

  return (
    <div className="flex min-h-dvh">
      <Sidebar items={items} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-card px-4 py-3 sm:px-6">
          <MobileNav items={items} />
          <h1 className="label-caps text-fg">{title}</h1>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-fg-muted sm:inline">{fullName}</span>
            <span className="label-caps rounded-full bg-ink px-2.5 py-1 text-white">
              {role}
            </span>
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <footer className="px-4 pb-6 text-xs text-fg-subtle sm:px-6">
          Signed in as {username}
        </footer>
      </div>
    </div>
  );
}
