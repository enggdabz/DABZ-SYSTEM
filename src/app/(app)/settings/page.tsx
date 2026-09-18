import { connection } from "next/server";

import { Card, Notice } from "@/components/ui";
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";

import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings · Dabz System" };

export default async function SettingsPage() {
  await connection();

  await requireOwnerOrAdmin();
  const settings = await getSettings();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted">
          The numbers the rest of the system works from. Changing one is
          recorded in Activity, with the old and new value.
        </p>
      </div>

      <Notice tone="info" title="These start as the specification's defaults">
        <p>
          Change them to match how the shop actually runs - that is what open
          decisions 17.5 and 17.8 were about.
        </p>
      </Notice>

      <Card>
        <SettingsForm settings={settings} />
      </Card>
    </div>
  );
}
