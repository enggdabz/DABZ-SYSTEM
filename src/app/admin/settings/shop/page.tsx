import type { Metadata } from "next";

import { ShopForm } from "@/app/admin/settings/shop/shop-form";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shop settings" };

export default async function ShopSettingsPage() {
  await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Shop settings" />
      <Card className="p-5">
        {data ? (
          <ShopForm settings={data} />
        ) : (
          <Alert>The settings row is missing from the database.</Alert>
        )}
      </Card>
    </div>
  );
}
