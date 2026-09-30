import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
  "Regular sale must stay exactly as it is now" (owner, 30 Sep 2026), turned
  into something that fails if it stops being true. These read source files
  rather than run them: the behaviour of a regular sale is proved by
  PosScreen.test.tsx and the RLS suite, and what THIS guards is the way the
  project work could have reached into it.
*/
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a regular sale is left alone by project sales", () => {
  const migration = read(
    "supabase/migrations/0024_project_details_and_sale_link.sql",
  );

  it("does not redefine the function that writes every sale", () => {
    // complete_sale is what a regular sale is. Project sales CALL it; a change
    // to it would change the regular sale too.
    expect(migration).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.complete_sale/i);
    expect(migration).toMatch(/public\.complete_sale\(/);
  });

  it("only ever adds nullable columns to sales, so a regular sale needs neither", () => {
    const additions = migration.match(
      /alter table public\.sales\s+add column if not exists[^;]*;/i,
    )?.[0];
    expect(additions).toBeTruthy();
    expect(additions).not.toMatch(/not null/i);
    expect(additions).not.toMatch(/default/i);
  });

  it("leaves the sale lines, the ledger and the void rules to the functions that already own them", () => {
    for (const table of ["sale_lines", "ledger_entries", "void_requests"]) {
      expect(migration).not.toMatch(new RegExp(`(alter|drop)\\s+table\\s+public\\.${table}`, "i"));
    }
  });

  it("is not imported by the regular sale screen or its action", () => {
    for (const file of [
      "src/app/(app)/pos/PosScreen.tsx",
      "src/app/(app)/pos/actions.ts",
      "src/lib/pos.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/project-types|project-find|lib\/projects|ProjectSaleForm/);
    }
  });

  it("never lets the shared sale queries name a column that only 0024 adds", () => {
    // Every receipt and the Sales screen read `sales`. A select that asked for
    // project_id would fail on a database still waiting for 0024 - and take
    // every regular sale with it. Project code reads project_payments instead.
    const shared = read("src/lib/data/pos.ts");
    expect(shared).not.toMatch(/project_id|payment_kind/);
  });
});
