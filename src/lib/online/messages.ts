/**
 * The message staff paste into Messenger (docs/spec.md 10).
 *
 * VERSION 1 SENDS NOTHING. Sending a Messenger message needs a Meta app, a
 * page token and Meta's own app review - credentials that belong to the owner
 * and that no system should obtain on their behalf. So the shop keeps talking
 * to the customer in the chat they are already in, and this writes what to
 * say, ready to copy.
 *
 * Which is also why the wording matters: this is the shop's voice, not a
 * notification. It says what has happened and what happens next, and it never
 * promises a figure the system does not have - a down payment share the owner
 * has not set is simply not mentioned.
 */
import { formatPesos } from "@/lib/money";
import { formatCivilDate } from "@/lib/period";

import { orderTotals } from "./totals";
import type { OrderDetail, ProductionStage } from "./types";
import { lastDoneStage, currentStage, progress, stagesForPath } from "./production";

export interface MessageContext {
  order: OrderDetail;
  stages: readonly ProductionStage[];
  /** Null until the owner sets one (open decision D6 / 17.10). */
  downPaymentPercent: number | null;
}

export function messageFor({ order, stages, downPaymentPercent }: MessageContext): string {
  const name = order.customerName;
  const no = order.orderNo;
  const totals = orderTotals(order.items, order.quoteAmountCentavos, order.payments);

  switch (order.status) {
    case "new":
      /*
        Two messages, because an order with nothing to price is not waiting on
        the shop for a figure. Telling a customer "we will send the quote
        shortly" when the price was on the page is confusing, and telling them
        nothing is worse.
      */
      return totals.hasQuoteItems
        ? `Hi ${name}! We received your order ${no}. We are checking your design and will send the quote shortly.`
        : `Hi ${name}! We received your order ${no}. We will confirm it and send the down payment details shortly.`;

    case "quoted":
      return `Hi ${name}! Your quote for order ${no} (${totals.pieces} pcs) is ${formatPesos(
        totals.totalCentavos,
      )}.${downPaymentSentence(totals.totalCentavos, downPaymentPercent)} Reply YES to confirm and we will send the down payment details.`;

    case "confirmed":
      return `Hi ${name}! Order ${no} is confirmed. Payment received so far: ${formatPesos(
        totals.paidCentavos,
      )}. We will send your layout for approval next.`;

    case "in_production": {
      const path = stagesForPath(stages, order.productionPath);
      const done = lastDoneStage(stages, order.productionPath, order.production);
      const current = currentStage(stages, order.productionPath, order.production);
      const counted = progress(stages, order.productionPath, order.production);

      if (done === null || current === null) {
        return `Hi ${name}! Order ${no} is now in production. The first step is your design layout. Please check it carefully when we send it, especially names, numbers and sizes.`;
      }

      return `Hi ${name}! Update on order ${no}: ${done.customerLabel} is done and it is now in ${
        current.customerLabel
      } (step ${counted.done + 1} of ${path.length}). Target date: ${formatCivilDate(
        order.dateNeeded,
      )}.`;
    }

    case "ready_to_ship":
      return `Hi ${name}! Order ${no} is packed and ready for ${
        order.method === "delivery" ? "delivery" : "pick up"
      }. Remaining balance: ${formatPesos(totals.balanceCentavos)}.`;

    case "completed":
      return `Thank you ${name}! Order ${no} is complete. We would love to see your team photo. See you on your next order!`;

    case "cancelled":
      return `Hi ${name}, order ${no} has been cancelled. Message us any time if you want to order again.`;
  }
}

/**
 * " The down payment is PHP 5,350.00 (50%)." - or nothing at all.
 *
 * Empty when the owner has not set a percentage, which is the state it ships
 * in. The specification offers "e.g. 50%", which is an example rather than the
 * owner saying so, and a made-up policy would have staff turning away a
 * customer who paid what the owner actually wanted.
 */
function downPaymentSentence(
  totalCentavos: number,
  percent: number | null,
): string {
  if (percent === null || percent <= 0) return "";
  const amount = Math.round((totalCentavos * percent) / 100);
  return ` The down payment is ${formatPesos(amount)} (${percent}%).`;
}
