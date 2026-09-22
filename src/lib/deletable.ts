/**
 * What may be deleted, and what may only be stopped.
 *
 * The owner types the bills, the loans and the products in by hand, so a row
 * entered wrongly has to be removable - "stop counting it" is the right answer
 * for a bill the shop really paid for two years and an odd one for a typo five
 * seconds old, which would then sit under "no longer counted" forever.
 *
 * The line is money. Once a bill has been marked paid, a loan paid down or a
 * product sold, there are payment rows hanging off it and ledger entries
 * pointing at those. Those foreign keys cascade, so deleting the parent would
 * take the payments with it and leave the ledger describing money that moved
 * against a bill that no longer exists - the same silent hole the void rules
 * exist to prevent. A row like that is stopped, which keeps every figure and
 * only takes it out of the running totals.
 *
 * The database enforces this (the delete policies in migration 0011). This
 * file is the wording, kept in one place so the button, the refusal and the
 * explanation on screen cannot drift apart - and so the sentences can be
 * tested, since they are the part the owner actually reads.
 */

/**
 * Everything this file has a rule for.
 *
 * An array rather than a bare union type, so that a test can walk it: the
 * union existed first and `deletable.test.ts` kept its own hand-written copy,
 * which promptly fell a kind behind. A list that cannot drift is worth more
 * than a comment asking somebody to remember.
 */
export const CATALOGUE_KINDS = [
  "bill",
  "loan",
  "product",
  "apparel item",
  "repair service",
  "apparel project",
] as const;

export type CatalogueKind = (typeof CATALOGUE_KINDS)[number];

interface Rule {
  noun: string;
  /** Why this row has to stay, in the owner's words. */
  because: string;
  /** The honest alternative, named as the button that does it. */
  instead: string;
}

const RULES: Record<CatalogueKind, Rule> = {
  bill: {
    noun: "bill",
    because: "it has already been marked paid",
    instead:
      "Stop counting it instead: it keeps its payment history and drops out of the monthly total.",
  },
  loan: {
    noun: "loan",
    because: "payments have been recorded against it",
    instead:
      "Stop counting it instead: it keeps its payment history and drops out of the total owed.",
  },
  product: {
    noun: "product",
    because: "it has already been sold",
    instead:
      "Hide it from the counter instead: the button goes away and old sales still read correctly.",
  },
  "apparel item": {
    noun: "item",
    because: "it is already on a job order",
    instead:
      "Stop offering it instead: it disappears from new orders and the ones already written still read correctly.",
  },
  "repair service": {
    noun: "service",
    because: "it has already been charged on a ticket",
    instead:
      "Stop offering it instead: it disappears from new tickets and the ones already written still read correctly.",
  },
  /*
    A whole job order, not a catalogue row - and the only one here where the
    thing being deleted is a JOB rather than a list entry. It earns its place
    because the rule is identical: a project written by mistake can go, and one
    with money, bench marks or a customer holding the sheet cannot.
  */
  "apparel project": {
    noun: "project",
    because:
      "money has been taken against it, the shop floor has marked its benches, or it has already been released",
    /*
      "while it is still open" is not padding. One of the three things that
      stops a delete is the project having been RELEASED - and a released
      project cannot be cancelled either, so a flat "cancel it instead" would
      send somebody looking for a button that is correctly not there.
    */
    instead:
      "Cancel it with a reason instead, while it is still open: it keeps every figure and every name, and the list says why it stopped.",
  },
};

/** Whether the Delete button should be offered at all. */
export function canDelete(hasHistory: boolean): boolean {
  return !hasHistory;
}

/**
 * The sentence shown when a delete is refused, or null when it is allowed.
 *
 * Both the Server Action and the screen call this, so a row the screen offers
 * to delete is one the action will delete, and a refusal reads the same
 * wherever it appears.
 */
export function deleteRefusal(
  kind: CatalogueKind,
  hasHistory: boolean,
): string | null {
  if (!hasHistory) return null;
  const rule = RULES[kind];
  return `This ${rule.noun} cannot be deleted because ${rule.because}. ${rule.instead}`;
}

/**
 * What the confirmation step says before anything is removed.
 *
 * Deliberately names the row. "Are you sure?" beside eleven identical cards is
 * a question about nothing in particular, and the counter is a place where
 * people tap quickly.
 */
export function deleteConfirmation(kind: CatalogueKind, name: string): string {
  return `Delete ${name} permanently? This ${RULES[kind].noun} has no history, so nothing else is affected.`;
}

/**
 * The refusal used when the database turns a delete down but this file thought
 * it was allowed.
 *
 * A DELETE whose policy does not match removes no rows and raises no error, so
 * without this the owner would be told something was deleted when it was not.
 * In practice it means the row gained history between the screen rendering and
 * the button being pressed.
 */
export function deleteVanished(kind: CatalogueKind): string {
  const rule = RULES[kind];
  return `Nothing was deleted: this ${rule.noun} now has history behind it. ${rule.instead}`;
}

/**
 * What to say when the "has this got history?" question cannot be asked.
 *
 * Supabase does not reach PostgreSQL directly - it goes through PostgREST,
 * which keeps its own cache of what functions exist. A cache built before
 * migration 0011 or 0012 ran answers "function not found", which looks exactly
 * like a migration that was never applied and has a different fix. Both are
 * named, because from the screen they are indistinguishable (see
 * `src/lib/postgrest.ts`).
 *
 * The delete is refused rather than attempted: without the answer the screen
 * cannot promise that deleting is safe, and a delete that takes a payment
 * history with it is not something to find out about afterwards.
 */
export function historyCheckUnavailable(rpcName: string): string {
  return (
    `The system could not reach ${rpcName}, so it cannot tell whether this is safe to delete - ` +
    "and it will not guess. Show this to the owner: in the Supabase SQL editor run " +
    "notify pgrst, 'reload schema'; and if that does not help, the migrations have not " +
    "been applied, so run npm run db:push."
  );
}
