"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { decideVoidRequest, requestVoid, voidSale } from "@/app/admin/sales/actions";
import { Button, fieldClass } from "@/components/ui";
import { emptyActionState } from "@/lib/action-state";

function Pending({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending} className="shrink-0">
      {pending ? "Working…" : label}
    </Button>
  );
}

/** Owners and admins void directly; staff may only ask. */
export function VoidForm({
  saleId,
  mode,
}: {
  saleId: string;
  mode: "void" | "request";
}) {
  const [state, action] = useActionState(
    mode === "void" ? voidSale : requestVoid,
    emptyActionState,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="sale_id" value={saleId} />
      <input
        name="reason"
        required
        placeholder={mode === "void" ? "Reason for voiding" : "Why should this be voided?"}
        className={`${fieldClass} min-w-48 flex-1`}
      />
      <Pending label={mode === "void" ? "Void sale" : "Request void"} />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
      {state.notice ? (
        <p className="w-full text-xs text-emerald-700">{state.notice}</p>
      ) : null}
    </form>
  );
}

export function DecideVoidForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(decideVoidRequest, emptyActionState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="request_id" value={requestId} />
      <input name="note" placeholder="Note (optional)" className={`${fieldClass} min-w-40 flex-1`} />
      <button
        type="submit"
        name="approve"
        value="true"
        className="label-caps rounded-lg bg-brand px-3 py-2 text-white transition hover:bg-brand-strong"
      >
        Approve &amp; void
      </button>
      <button
        type="submit"
        name="approve"
        value="false"
        className="label-caps rounded-lg border border-line px-3 py-2 text-fg-muted transition hover:border-brand"
      >
        Reject
      </button>
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}
