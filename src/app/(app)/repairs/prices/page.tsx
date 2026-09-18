import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getRepairServices } from "@/lib/data/repairs";
import { formatPesos } from "@/lib/money";
import { UNIT_KIND_LABELS, type UnitKind } from "@/lib/repairs";

import { ServiceForm } from "./PriceForms";

export const metadata = { title: "Repair prices · Dabz System" };

const GROUPS: { key: UnitKind | "any"; label: string }[] = [
  { key: "any", label: "Any machine" },
  { key: "epson_printer", label: UNIT_KIND_LABELS.epson_printer },
  { key: "laptop", label: UNIT_KIND_LABELS.laptop },
  { key: "desktop", label: UNIT_KIND_LABELS.desktop },
];

export default async function RepairPricesPage() {
  await connection();

  // Prices are the owner's to set (spec 7.2), the same rule everywhere else.
  await requireOwnerOrAdmin();

  const [services, settings] = await Promise.all([
    getRepairServices(),
    getSettings(),
  ]);

  const unpriced = services.filter(
    (service) => service.active && service.priceCentavos === null,
  );
  const checkingFee = services.find((service) => service.isCheckingFee);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/repairs" className={`text-sm text-muted underline ${TAP_AREA}`}>
          &larr; Back to repair tickets
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Repair prices
        </h1>
        <p className="mt-2 text-muted">
          The checking fee and what each repair costs. Nothing here was filled in
          for you.
        </p>
      </div>

      <Notice tone="info" title="Laptop and desktop are listed separately">
        You asked whether they cost the same for the same work. I did not
        decide: the same service can be listed once for <em>any machine</em>, or
        once per machine with its own price. Cleaning &amp; repaste is set up
        both ways so you can price them apart, or give them the same number.
      </Notice>

      {checkingFee && checkingFee.priceCentavos === null ? (
        <Notice tone="attention" title="The checking fee has no price">
          It is the one charge that applies even when the customer says no to
          the repair, so it is worth setting first.
        </Notice>
      ) : null}

      {unpriced.length > 0 ? (
        <Notice
          tone="attention"
          title={`${unpriced.length} service${
            unpriced.length === 1 ? " has" : "s have"
          } no price`}
        >
          Tickets still work &mdash; whoever writes one is asked for the price.
          Setting them stops two people charging differently for the same job.
        </Notice>
      ) : null}

      {GROUPS.map((group) => {
        const own = services.filter((service) => service.unitKind === group.key);
        if (own.length === 0) return null;

        return (
          <Card key={group.key} title={group.label}>
            <ul className="divide-y divide-line/60">
              {own.map((service) => (
                <li
                  key={service.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span>
                    <span className="font-medium">{service.name}</span>
                    {service.isCheckingFee ? (
                      <span className="ml-2">
                        <Tag tone="accent">Charged even on a no</Tag>
                      </span>
                    ) : null}
                    {!service.active ? (
                      <span className="ml-2">
                        <Tag>Not offered</Tag>
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted">
                      {service.priceCentavos === null ? (
                        <>
                          <span aria-hidden="true">{"⚠"} </span>no price set
                        </>
                      ) : (
                        formatPesos(service.priceCentavos)
                      )}
                      {service.note ? ` · ${service.note}` : ""}
                    </span>
                  </span>
                  <ServiceForm service={service} />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      <Card title="Add a service">
        <ServiceForm />
      </Card>

      <Card
        title="Warranty and unclaimed units"
        description="Both live in Settings, because they apply to the whole shop."
      >
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-muted">Warranty on a released repair</dt>
            <dd className="font-medium">{settings.defaultWarrantyDays} days</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-muted">A unit counts as unclaimed after</dt>
            <dd className="font-medium">{settings.unclaimedUnitDays} days</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">
          The warranty is copied onto each ticket when the unit is released, so
          changing this number never shortens a promise already made.
        </p>
        <Link href="/settings" className={`mt-4 inline-block text-sm underline ${TAP_AREA}`}>
          Change them in Settings
        </Link>
      </Card>
    </div>
  );
}
