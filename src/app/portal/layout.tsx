import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { profile, role } = await requireUser();

  return (
    <AppShell
      title="My account"
      role={role}
      username={profile.username}
      fullName={profile.full_name}
    >
      {children}
    </AppShell>
  );
}
