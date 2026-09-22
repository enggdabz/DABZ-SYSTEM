import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getOnlineOrders, getProductionStages } from "@/lib/data/online";
import { boardColumns, boardRowNote } from "@/lib/online/board";
import { isOverdue } from "@/lib/online/status";
import { formatCivilDate, manilaToday } from "@/lib/period";

import { OnlineTabs } from "../OnlineTabs";
import { onlineTabs } from "../tabs";
import { BoardButton } from "./BoardButton";

export const metadata = { title: "Production board · Dabz System" };

export default async function ProductionBoardPage() {
  await connection();
  const user = await requirePermission("apparel_job_orders");

  const [orders, stages] = await Promise.all([
    getOnlineOrders(),
    getProductionStages(),
  ]);

  const today = manilaToday();
  const columns = boardColumns(orders, stages, today);
  const onBoard = columns.reduce((total, column) => total + column.orders.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Production board</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Every order sits in the step it is waiting for. Tap OK when that step
          is finished and the order moves to the next card. After Packaging it
          becomes Ready to ship by itself.
        </p>
      </div>

      <OnlineTabs tabs={onlineTabs(isOwnerOrAdmin(user))} />

      {onBoard === 0 ? (
        <Notice tone="info" title="Nothing in production">
          <p>
            An order reaches this board once it is confirmed. Until then it is
            on the{" "}
            <Link href="/online-orders" className={`underline ${TAP_AREA}`}>
              orders list
            </Link>
            .
          </p>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((column) => (
          <Card key={column.key} className="!p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">
              {column.eyebrow}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold tracking-tight">{column.title}</h2>
              <span
                className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  column.orders.length > 0
                    ? "bg-ink text-surface"
                    : "bg-ink/5 text-muted"
                }`}
              >
                {column.orders.length}
              </span>
            </div>

            <p className="mt-1 text-xs text-muted">{column.description}</p>

            {column.orders.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {column.orders.map((order) => {
                  const late = isOverdue(order, today);
                  return (
                    <li
                      key={order.id}
                      className="flex flex-wrap items-start justify-between gap-3 border-t border-line/60 pt-3"
                    >
                      <Link
                        href={`/online-orders/${order.orderNo}`}
                        className="min-w-0 flex-1"
                      >
                        <span className="block text-sm font-medium">
                          {order.orderNo} &middot; {order.customerName}
                        </span>
                        <span className="block text-xs text-muted">
                          {boardRowNote(order, formatCivilDate)}
                        </span>
                        {late ? (
                          <span className="block text-xs font-medium text-accent">
                            <span aria-hidden="true">{"⚠"}</span> Overdue
                          </span>
                        ) : null}
                      </Link>

                      <BoardButton
                        orderId={order.id}
                        orderNo={order.orderNo}
                        action={column.action}
                        stageKey={column.stageKey}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
