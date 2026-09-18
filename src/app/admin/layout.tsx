import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { profile, role } = await requireUser();

  return (
    <AppShell role={role} username={profile.username} fullName={profile.full_name}>
      {children}
    </AppShell>
  );
}
