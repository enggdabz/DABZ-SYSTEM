/**
 * A few products by id, as cards - for the "Recently viewed" strip, which
 * remembers ids in the browser and needs the rest from here.
 *
 * Only what a visitor may see: an id for a hidden or deleted product comes
 * back as nothing. The ids are checked to be UUIDs and capped at twelve, so
 * this cannot be used to ask for the whole catalogue in one go.
 */
import { NextResponse } from "next/server";

import { getStoreProductsByIds, isStoreOpen } from "@/lib/data/store";
import { toCard } from "@/lib/store/card";
import { storeImageUrl } from "@/lib/store/storage";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 12;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => UUID.test(id))
    .slice(0, MAX_IDS);

  if (ids.length === 0 || !(await isStoreOpen())) {
    return NextResponse.json({ products: [] });
  }

  const products = await getStoreProductsByIds(ids);
  const now = new Date();
  return NextResponse.json({ products: products.map((p) => toCard(p, now, storeImageUrl)) });
}
