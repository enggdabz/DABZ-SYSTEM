import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { getCustomers, getSales } from "@/lib/data/pos";
import { formatManilaDateTime } from "@/lib/datetime";
import { formatPesos, sumCentavos } from "@/lib/money";

import { CustomerForm } from "./CustomerForm";

export const metadata = { title: "Customers · Dabz System" };

export default async function CustomersPage() {
  await connection();

  await requireUser();

  // Sales come back filtered by Row Level Security, so a staff member sees the
  // history from their own sales and the owner sees all of it.
  const [customers, sales] = await Promise.all([
    getCustomers(),
    getSales({ limit: 500 }),
  ]);

  const salesByCustomer = new Map<string, typeof sales>();
  for (const sale of sales) {
    if (!sale.customerId || sale.voidedAt) continue;
    const list = salesByCustomer.get(sale.customerId) ?? [];
    list.push(sale);
    salesByCustomer.set(sale.customerId, list);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-2 text-muted">
          One list, shared by all three divisions. A quick walk-in sale does not
          need a customer at all.
        </p>
      </div>

      {customers.length === 0 ? (
        <Notice tone="info" title="No customers yet">
          <p>
            They are usually added at the counter, when you complete a sale. You
            can also add one here.
          </p>
        </Notice>
      ) : null}

      <Card title="Add a customer">
        <CustomerForm />
      </Card>

      <section className="space-y-4">
        {customers.map((customer) => {
          const history = salesByCustomer.get(customer.id) ?? [];
          const spent = sumCentavos(history.map((sale) => sale.totalCentavos));

          return (
            <Card key={customer.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {customer.name}
                  </h2>
                  <dl className="mt-1 space-y-0.5 text-sm text-muted">
                    {customer.contactNumber ? <dd>{customer.contactNumber}</dd> : null}
                    {customer.facebookName ? (
                      <dd>Messenger: {customer.facebookName}</dd>
                    ) : null}
                    {customer.address ? <dd>{customer.address}</dd> : null}
                    {customer.note ? <dd>{customer.note}</dd> : null}
                  </dl>
                </div>

                <div className="text-right">
                  <p className="text-xs font-medium text-muted">Bought</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">
                    {formatPesos(spent)}
                  </p>
                  <p className="text-xs text-muted">
                    {history.length} sale{history.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              {history.length > 0 ? (
                <details className="mt-4 border-t border-line/60 pt-3">
                  <summary className="cursor-pointer text-sm text-muted hover:text-ink">
                    Purchase history
                  </summary>
                  <ul className="mt-3 divide-y divide-line/60 text-sm">
                    {history.slice(0, 20).map((sale) => (
                      <li
                        key={sale.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                      >
                        <span className="flex items-center gap-2">
                          <Tag>{sale.saleNumber}</Tag>
                          <span className="text-xs text-muted">
                            {formatManilaDateTime(sale.occurredAt)}
                          </span>
                        </span>
                        <span className="font-medium">
                          {formatPesos(sale.totalCentavos)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Card>
          );
        })}
      </section>

      <Notice tone="info" title="Job orders and repairs join this list later">
        <p>
          Dabz Apparel job orders arrive in Phase 6 and DabzTech repairs in
          Phase 7. Both will use these same customers, so anything you add now
          carries over.
        </p>
      </Notice>
    </div>
  );
}
