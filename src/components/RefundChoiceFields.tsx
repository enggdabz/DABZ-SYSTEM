/**
 * The refund question in a delete dialog: two plain choices, and NO default.
 *
 * "Refund" voids the customer's payment and "keep" leaves it in the books, and
 * neither is the safe one to tick by accident - a default of refund voids a
 * payment on a stray tap, and a default of keep leaves money in the books that
 * somebody believed they had handed back. So the first is `required` and
 * nothing is ticked.
 *
 * Shared by the Counter project's dialog and the apparel project's, so the two
 * cannot drift apart in wording or behaviour.
 */
export function RefundChoiceFields({
  paidLabel,
  refundsNow,
}: {
  /** What has been paid, live: "₱2,000.00". */
  paidLabel: string;
  /**
   * True when choosing refund refunds straight away (the owner). False when it
   * only ASKS (an admin's request), and the words say so.
   */
  refundsNow: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {paidLabel} has been paid on this project. What happens to it?
      </legend>
      <label className="flex items-start gap-2 rounded-control p-2 text-sm ring-1 ring-line">
        <input
          type="radio"
          name="refund"
          value="refund"
          required
          className="mt-1"
        />
        <span>
          <span className="font-medium">Refund {paidLabel}</span>
          <span className="block text-xs text-muted">
            {refundsNow
              ? "The payment is voided and the money is handed back. It comes off today's takings."
              : "Asked for now; nothing is refunded until the owner approves."}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 rounded-control p-2 text-sm ring-1 ring-line">
        <input type="radio" name="refund" value="keep" className="mt-1" />
        <span>
          <span className="font-medium">Keep the money</span>
          <span className="block text-xs text-muted">
            The payment stays in Sales and End of day, marked
            &ldquo;Project deleted&rdquo;.
          </span>
        </span>
      </label>
    </fieldset>
  );
}
