"use client";

import { useActionState, useEffect } from "react";

import { TAP_AREA } from "@/components/ui";
import type { CartFile } from "@/lib/online/cart";

import { uploadOrderFileAction, type UploadState } from "../../../actions";

/**
 * Attaching a file, before there is an order to attach it to.
 *
 * It uploads as soon as the customer picks it, rather than at checkout, for
 * one reason: the order lives in `localStorage` until they press Place order,
 * and a File cannot be stored there. What the cart carries is the path the
 * server hands back.
 *
 * The bytes go through the server, which looks at them (see
 * `src/lib/online/uploads.ts`). Everything the customer sees here is either
 * the name of their own file or a sentence telling them what went wrong.
 */
export function FileAttachment({
  label,
  file,
  onChange,
}: {
  label: string;
  file: CartFile | null;
  onChange: (file: CartFile | null) => void;
}) {
  const [state, submit, pending] = useActionState<UploadState, FormData>(
    uploadOrderFileAction,
    {},
  );

  useEffect(() => {
    if (state.file) onChange(state.file);
    // `onChange` is a setState function, stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.file]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted">
        JPG, PNG, WebP or PDF, up to 20MB. One file per item.
      </p>

      {file ? (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-seg px-3 py-2 text-sm">
          <span aria-hidden="true">{"📎"}</span>
          <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`text-accent underline ${TAP_AREA}`}
          >
            Remove
          </button>
        </div>
      ) : (
        <form action={submit} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="block max-w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-ink/5 file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink disabled:opacity-50"
          >
            {pending ? "Uploading…" : "Attach"}
          </button>
        </form>
      )}

      {state.error ? (
        <p className="flex items-start gap-1.5 text-sm text-accent">
          <span aria-hidden="true">{"⚠"}</span>
          <span>{state.error}</span>
        </p>
      ) : null}
    </div>
  );
}
