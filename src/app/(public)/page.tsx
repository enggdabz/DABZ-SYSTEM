import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Card, TAP_AREA } from "@/components/ui";
import { getPublicServices, getPublicSettings } from "@/lib/data/public";
import { DIVISIONS, DIVISION_IDS } from "@/lib/divisions";
import { formatPesos } from "@/lib/money";
import { settingsFromRow, type SettingsRow } from "@/lib/settings";

import { EnquiryForm } from "./EnquiryForm";

export const metadata: Metadata = {
  title: "Dabz Printshoppe · Printing, jerseys and repairs in San Carlos City",
  description:
    "Printing, photocopying, tarpaulins and mugs; sublimation jerseys and shirts; Epson printer, laptop and desktop repairs. San Carlos City, Pangasinan, since 2017.",
};

/**
 * The shop's public page (Phase 9).
 *
 * The page a customer lands on from Facebook. It is built from the SAME price
 * lists the counter uses, so it cannot quietly go out of date the way a
 * hand-written page does - change a price on the Products screen and this page
 * changes with it.
 *
 * Everything the owner has not filled in is LEFT OUT rather than filled with a
 * placeholder. A made-up address on a page a real person might drive to is a
 * different order of mistake from a made-up figure on an internal screen.
 */
export default async function PublicHomePage() {
  await connection();

  const [divisions, settingsRow] = await Promise.all([
    getPublicServices(),
    getPublicSettings(),
  ]);

  const settings = settingsRow
    ? settingsFromRow(settingsRow as SettingsRow)
    : null;

  // Switched off, or not set up yet: staff still sign in, customers see a
  // short honest page rather than a broken one.
  if (settings && !settings.publicPageEnabled) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Dabz Printshoppe
        </h1>
        <p className="mt-4 text-muted">
          Our page is being updated. Please message us on Facebook or drop by
          the shop.
        </p>
        <Link href="/login" className={`mt-8 inline-block text-sm underline ${TAP_AREA}`}>
          Staff sign in
        </Link>
      </section>
    );
  }

  const messengerUrl = settings?.messengerUsername
    ? `https://m.me/${settings.messengerUsername.replace(/^@/, "")}`
    : null;

  const hasAnyContact = Boolean(
    settings?.shopPhone ||
      settings?.shopAddress ||
      settings?.facebookPageUrl ||
      messengerUrl ||
      settings?.shopEmail,
  );

  return (
    <>
      {/* ---- Hero -------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        <p className="text-sm font-medium text-accent">
          San Carlos City, Pangasinan &middot; since 2017
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Printing, jerseys and repairs,
          <span className="block text-muted">all in one shop.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Three things under one roof: everyday printing and photocopying,
          sublimation jerseys for your team, and honest repairs for Epson
          printers, laptops and desktops.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {/*
            The way into the online shop (Phase 12). First, and shaped like the
            main action, because it is the one thing on this page a customer
            can finish by themselves - everything else here ends in a message
            somebody has to answer.
          */}
          <Link
            href="/shop"
            className="rounded-control bg-accent px-5 py-3 text-sm font-medium text-on-accent hover:opacity-90"
          >
            Order jerseys online
          </Link>
          <a
            href="#contact"
            className="rounded-control bg-ink/5 px-5 py-3 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
          >
            Ask us about a job
          </a>
          {messengerUrl ? (
            <a
              href={messengerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-control bg-ink/5 px-5 py-3 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
            >
              Message us on Facebook
            </a>
          ) : null}
        </div>

        {settings?.publicOpeningHours || settings?.shopAddress ? (
          <p className="mt-6 text-sm text-muted">
            {settings.shopAddress ?? ""}
            {settings.shopAddress && settings.publicOpeningHours ? " · " : ""}
            {settings.publicOpeningHours ?? ""}
          </p>
        ) : null}
      </section>

      {/* ---- What we do -------------------------------------------------- */}
      <section id="what-we-do" className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">What we do</h2>
        <p className="mt-2 text-muted">
          Prices are what we actually charge. Where a job is priced by the piece
          or by size, ask us and we will work it out with you.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {DIVISION_IDS.map((id) => {
            const division = DIVISIONS[id];
            const services = divisions.find((entry) => entry.id === id)?.services ?? [];

            return (
              <Card key={id} className="flex flex-col">
                <h3 className="text-lg font-semibold tracking-tight">
                  {division.name}
                </h3>
                {division.tagline ? (
                  <p className="mt-1 text-sm text-accent">
                    &ldquo;{division.tagline}&rdquo;
                  </p>
                ) : null}

                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {services.length > 0
                    ? services.map((service) => (
                        <li
                          key={service.name}
                          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line/60 pb-2"
                        >
                          <span>
                            {service.name}
                            {service.note ? (
                              <span className="block text-xs text-muted">
                                {service.note}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={
                              service.priceCentavos === null
                                ? "text-xs text-muted"
                                : "font-medium"
                            }
                          >
                            {service.priceCentavos === null
                              ? "ask us"
                              : formatPesos(service.priceCentavos)}
                            {service.priceCentavos !== null && service.unit
                              ? ` / ${service.unit}`
                              : ""}
                          </span>
                        </li>
                      ))
                    : // Nothing set up yet: the division's own list from the
                      // specification, so the page still tells a customer what
                      // the shop does.
                      division.offers.map((offer) => (
                        <li key={offer} className="border-b border-line/60 pb-2">
                          {offer}
                        </li>
                      ))}
                </ul>

                {/*
                  Padded rather than bare: this is a link a customer taps with
                  a thumb, and bare text is a 20px target.
                */}
                <a
                  href="#contact"
                  className={`mt-4 inline-block text-sm underline ${TAP_AREA}`}
                >
                  Ask about {division.name}
                </a>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---- Contact ----------------------------------------------------- */}
      <section id="contact" className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <Card
            title="Tell us about the job"
            description="A message here reaches the shop. We read them every day we are open."
          >
            <EnquiryForm />
          </Card>

          <div className="space-y-6">
            <Card title="Find us">
              {hasAnyContact ? (
                <dl className="space-y-3 text-sm">
                  {settings?.shopAddress ? (
                    <div>
                      <dt className="text-xs font-medium text-muted">Address</dt>
                      <dd className="mt-0.5">{settings.shopAddress}</dd>
                    </div>
                  ) : null}

                  {settings?.publicOpeningHours ? (
                    <div>
                      <dt className="text-xs font-medium text-muted">Open</dt>
                      <dd className="mt-0.5">{settings.publicOpeningHours}</dd>
                    </div>
                  ) : null}

                  {settings?.shopPhone ? (
                    <div>
                      <dt className="text-xs font-medium text-muted">Phone</dt>
                      <dd className="mt-0.5">
                        <a
                          href={`tel:${settings.shopPhone.replace(/\s/g, "")}`}
                          className={`underline ${TAP_AREA}`}
                        >
                          {settings.shopPhone}
                        </a>
                      </dd>
                    </div>
                  ) : null}

                  {settings?.shopEmail ? (
                    <div>
                      <dt className="text-xs font-medium text-muted">Email</dt>
                      <dd className="mt-0.5">
                        <a
                          href={`mailto:${settings.shopEmail}`}
                          className={`underline ${TAP_AREA}`}
                        >
                          {settings.shopEmail}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-muted">
                  Send us a message using the form and we will come back to you.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {messengerUrl ? (
                  <a
                    href={messengerUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
                  >
                    Messenger
                  </a>
                ) : null}
                {settings?.facebookPageUrl ? (
                  <a
                    href={settings.facebookPageUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
                  >
                    Facebook page
                  </a>
                ) : null}
                {settings?.mapUrl ? (
                  <a
                    href={settings.mapUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
                  >
                    Get directions
                  </a>
                ) : null}
              </div>
            </Card>

            {/*
              No "owner, fill this in" note here, deliberately. This page is
              read by CUSTOMERS, and a message addressed to the owner on it
              reads as a shop that has not finished setting itself up. The
              missing details are listed on the To fill in screen instead,
              where only the owner sees them.
            */}
          </div>
        </div>
      </section>
    </>
  );
}
