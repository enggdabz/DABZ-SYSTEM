"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createUser,
  resetPassword,
  setUserStatus,
  togglePermission,
} from "@/app/admin/settings/actions";
import { emptyActionState } from "@/lib/action-state";
import { Alert, Button, Field, fieldClass } from "@/components/ui";
import type { AppRole, Permission } from "@/lib/types/app";

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function CreateUserForm({ actorRole }: { actorRole: AppRole }) {
  const [state, action] = useActionState(createUser, emptyActionState);

  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Full name">
        <input name="full_name" required className={fieldClass} />
      </Field>

      <Field label="Username" hint="Lowercase letters, numbers, dots, hyphens or underscores.">
        <input
          name="username"
          required
          autoCapitalize="none"
          spellCheck={false}
          className={fieldClass}
        />
      </Field>

      <Field label="Temporary password" hint="They will be asked to change it.">
        <input name="password" type="text" required minLength={8} className={fieldClass} />
      </Field>

      <Field label="Role">
        <select name="role" defaultValue="staff" className={fieldClass}>
          <option value="staff">Staff</option>
          {/* Only an owner may create another admin or owner. */}
          {actorRole === "owner" ? (
            <>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </>
          ) : null}
        </select>
      </Field>

      {state.error ? (
        <div className="sm:col-span-2">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
      {state.notice ? (
        <div className="sm:col-span-2">
          <Alert tone="good">{state.notice}</Alert>
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <Submit label="Create account" />
      </div>
    </form>
  );
}

export function StatusToggle({
  userId,
  status,
}: {
  userId: string;
  status: string;
}) {
  const [state, action] = useActionState(setUserStatus, emptyActionState);
  const next = status === "active" ? "inactive" : "active";

  return (
    <form action={action} className="inline">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        className="label-caps text-fg-muted underline underline-offset-4 transition hover:text-brand"
      >
        {status === "active" ? "Deactivate" : "Activate"}
      </button>
      {state.error ? (
        <span className="ml-2 text-xs text-brand">{state.error}</span>
      ) : null}
    </form>
  );
}

export function PermissionToggle({
  userId,
  permission,
  granted,
}: {
  userId: string;
  permission: Permission;
  granted: boolean;
}) {
  const [, action] = useActionState(togglePermission, emptyActionState);

  return (
    <form action={action}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="permission" value={permission} />
      <input type="hidden" name="grant" value={String(!granted)} />
      <button
        type="submit"
        aria-pressed={granted}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
          granted
            ? "border-brand bg-brand-soft text-brand-strong"
            : "border-line text-fg-muted hover:border-brand"
        }`}
      >
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${granted ? "bg-brand" : "bg-line"}`}
        />
        <span>{permission.replaceAll("_", " ")}</span>
        <span className="label-caps ml-auto">{granted ? "On" : "Off"}</span>
      </button>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(resetPassword, emptyActionState);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <div className="min-w-48 flex-1">
        <Field label="New password">
          <input name="password" type="text" required minLength={8} className={fieldClass} />
        </Field>
      </div>
      <Submit label="Reset" variant="secondary" />
      {state.error ? (
        <p className="w-full text-xs text-brand">{state.error}</p>
      ) : null}
      {state.notice ? (
        <p className="w-full text-xs text-emerald-700">{state.notice}</p>
      ) : null}
    </form>
  );
}
