"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveShopSettings } from "@/app/admin/settings/actions";
import { emptyActionState } from "@/lib/action-state";
import { Alert, Button, Field, fieldClass } from "@/components/ui";

type Settings = {
  shop_address: string | null;
  shop_phone: string | null;
  shop_email: string | null;
  facebook_page_url: string | null;
  messenger_username: string | null;
  map_url: string | null;
  public_opening_hours: string | null;
  public_page_enabled: boolean | null;
  week_starts_on: string;
  receipt_paper: string;
  working_days_per_month: number;
  auto_logout_minutes: number;
  default_warranty_days: number;
  unclaimed_unit_days: number;
  staff_discount_limit_percent: string | number | null;
  apparel_down_payment_percent: string | number | null;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}

export function ShopForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState(saveShopSettings, emptyActionState);
  const percent = (v: string | number | null) => (v === null ? "" : String(Math.trunc(Number(v))));

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-4">
        <h3 className="label-caps text-fg-subtle">Shop details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address">
            <input name="shop_address" defaultValue={settings.shop_address ?? ""} className={fieldClass} />
          </Field>
          <Field label="Phone">
            <input name="shop_phone" defaultValue={settings.shop_phone ?? ""} className={fieldClass} />
          </Field>
          <Field label="Email">
            <input name="shop_email" type="email" defaultValue={settings.shop_email ?? ""} className={fieldClass} />
          </Field>
          <Field label="Facebook page">
            <input name="facebook_page_url" defaultValue={settings.facebook_page_url ?? ""} className={fieldClass} />
          </Field>
          <Field label="Messenger username">
            <input name="messenger_username" defaultValue={settings.messenger_username ?? ""} className={fieldClass} />
          </Field>
          <Field label="Map link">
            <input name="map_url" defaultValue={settings.map_url ?? ""} className={fieldClass} />
          </Field>
          <Field label="Opening hours">
            <input name="public_opening_hours" defaultValue={settings.public_opening_hours ?? ""} className={fieldClass} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-fg">
            <input
              type="checkbox"
              name="public_page_enabled"
              defaultChecked={settings.public_page_enabled ?? false}
              className="size-4 accent-[var(--color-brand)]"
            />
            Public enquiry page enabled
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="label-caps text-fg-subtle">Operations</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Working days per month" hint="1–31">
            <input name="working_days_per_month" type="number" min={1} max={31}
              defaultValue={settings.working_days_per_month} className={fieldClass} />
          </Field>
          <Field label="Payroll week starts">
            <select name="week_starts_on" defaultValue={settings.week_starts_on} className={fieldClass}>
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </Field>
          <Field label="Auto logout (minutes)" hint="1–480">
            <input name="auto_logout_minutes" type="number" min={1} max={480}
              defaultValue={settings.auto_logout_minutes} className={fieldClass} />
          </Field>
          <Field label="Default warranty (days)">
            <input name="default_warranty_days" type="number" min={0}
              defaultValue={settings.default_warranty_days} className={fieldClass} />
          </Field>
          <Field label="Unclaimed unit after (days)">
            <input name="unclaimed_unit_days" type="number" min={0}
              defaultValue={settings.unclaimed_unit_days} className={fieldClass} />
          </Field>
          <Field label="Receipt paper">
            <select name="receipt_paper" defaultValue={settings.receipt_paper} className={fieldClass}>
              <option value="thermal_58">Thermal 58mm</option>
              <option value="thermal_80">Thermal 80mm</option>
              <option value="bond_short">Bond, short</option>
            </select>
          </Field>
          <Field label="Staff discount limit (%)" hint="0–100">
            <input name="staff_discount_limit_percent" type="number" min={0} max={100}
              defaultValue={percent(settings.staff_discount_limit_percent)} className={fieldClass} />
          </Field>
          <Field label="Apparel down payment (%)" hint="0–100">
            <input name="apparel_down_payment_percent" type="number" min={0} max={100}
              defaultValue={percent(settings.apparel_down_payment_percent)} className={fieldClass} />
          </Field>
        </div>
      </section>

      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="good">{state.notice}</Alert> : null}

      <Submit />
    </form>
  );
}
