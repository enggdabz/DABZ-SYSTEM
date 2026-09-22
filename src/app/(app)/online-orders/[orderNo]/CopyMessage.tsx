"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

/**
 * The ready-made Messenger message (docs/spec.md 9.2, 10).
 *
 * Version 1 sends nothing: that needs a Meta app, a page token and Meta's own
 * app review, which belong to the owner. So the shop keeps talking to the
 * customer in the chat they are already in, and this writes what to say.
 *
 * Shown as a chat bubble rather than in a box, because that is what it is
 * about to become - and it is the whole message, so nobody has to remember to
 * add the order number.
 */
export function CopyMessage({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard access can be refused - an insecure origin, an old browser,
      // a permission. The message is on screen either way, so this says
      // nothing rather than throwing an error at somebody who can just select
      // the text.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap rounded-card rounded-bl-sm bg-tile px-4 py-3 text-sm">
        {message}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy message"}
        </Button>
        <span className="text-xs text-muted">
          Paste it in the customer&rsquo;s Messenger chat.
        </span>
      </div>
    </div>
  );
}
