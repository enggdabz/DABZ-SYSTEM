import Link from "next/link";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { getProductionStages } from "@/lib/data/online";

import { TrackForm } from "./TrackForm";

export const metadata = {
  title: "Track my order · Dabz Apparel",
  description: "Check where your Dabz Apparel order has got to.",
};

export default async function TrackPage() {
  await connection();
  const stages = await getProductionStages();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <Link href="/shop" className={`text-sm text-accent underline ${TAP_AREA}`}>
          <span aria-hidden="true">{"‹"}</span> Back to the shop
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Track my order</h1>
        <p className="mt-2 text-muted">
          Your order number and the mobile number you used when you ordered.
        </p>
      </div>

      <TrackForm stages={stages} />
    </div>
  );
}
