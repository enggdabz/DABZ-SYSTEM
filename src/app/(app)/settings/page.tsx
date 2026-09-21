import { connection } from "next/server";

import { Card, Notice } from "@/components/ui";
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getMySubscriptions } from "@/lib/data/notifications";
import { pushSetup } from "@/lib/notifications";

import { NotificationSettings } from "./NotificationSettings";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings · Dabz System" };

export default async function SettingsPage() {
  await connection();

  await requireOwnerOrAdmin();
  const [settings, phones] = await Promise.all([
    getSettings(),
    getMySubscriptions(),
  ]);

  /*
    Read on the server, so the screen and the sender agree about whether the
    shop is set up. The public key is meant to reach the browser - that is
    what NEXT_PUBLIC_ is for - and the private one never leaves here.
  */
  const setup = pushSetup({
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  });

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

      <Card>
        <NotificationSettings
          publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? null}
          missingKeys={setup.missing}
          phones={phones.map((phone) => ({
            id: phone.id,
            userAgent: phone.userAgent,
            createdAt: phone.createdAt,
            active: phone.active,
            lastError: phone.lastError,
          }))}
        />
      </Card>
    </div>
  );
}
