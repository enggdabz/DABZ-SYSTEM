/**
 * Search suggestions: up to six product names that match what was typed.
 *
 * Public, because a visitor is nobody - and safe to be, because it reads
 * through the ordinary client, so the database only ever hands back the names
 * of products a visitor may already see. The term is cleaned before it goes
 * near a query, capped at 40 characters, and needs at least two.
 */
import { NextResponse } from "next/server";

import { getSuggestionNames, isStoreOpen } from "@/lib/data/store";
import { cleanSearchTerm, rankSuggestions } from "@/lib/store/catalogue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const term = cleanSearchTerm(new URL(request.url).searchParams.get("q") ?? "");

  if (term.length < 2 || !(await isStoreOpen())) {
    return NextResponse.json({ suggestions: [] });
  }

  const names = await getSuggestionNames(term);
  return NextResponse.json({ suggestions: rankSuggestions(names, term, 6) });
}
