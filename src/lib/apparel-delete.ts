/**
 * Which "delete this project" an apparel project is offered (`0026`).
 *
 * THREE ANSWERS
 *   plain     the `0021` card: delete if nothing has happened, otherwise the
 *             refusal that says to cancel it instead. Unchanged.
 *   with_money  the owner's dialog: a soft delete with a refund question. For a
 *             project that has had a payment and nothing else - the case
 *             `0021` could only answer with "cancel it".
 *   ask_owner an admin looking at that same project: they are told the owner
 *             has to do it, and nothing is offered that would be refused.
 *
 * WHAT STAYS "cancel it instead"
 * A released project and one with a bench marked. They are records of the shop
 * floor and of the customer having the jerseys, not money, and the refund
 * choice is about money. `delete_apparel_project` refuses both as well - this
 * only stops the screen offering what the database would turn away.
 *
 * UNKNOWN IS NOT "NONE". If the marks could not be read, the project is not
 * offered the dialog: a bench mark nobody could see is the thing this must not
 * paper over.
 */
export type ApparelDeleteOffer = "plain" | "with_money" | "ask_owner";

export function apparelDeleteOffer(options: {
  /** `apparel_order_has_history`: true, false, or null when it could not be asked. */
  hasHistory: boolean | null;
  status: string;
  /** Any payment at all, live or voided. */
  hasPayments: boolean;
  hasBenchMarks: boolean;
  /** The production marks were read successfully. */
  marksKnown: boolean;
  isOwner: boolean;
}): ApparelDeleteOffer {
  if (options.hasHistory !== true) return "plain";
  if (!options.hasPayments) return "plain";
  if (options.status === "released") return "plain";
  if (!options.marksKnown || options.hasBenchMarks) return "plain";
  return options.isOwner ? "with_money" : "ask_owner";
}
