"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice, Select, Tag } from "@/components/ui";
import { PERMISSION_INFO, PERMISSIONS, type Permission, type Role } from "@/lib/auth/permissions";

import {
  createAccountAction,
  renameAccountAction,
  resetPasswordAction,
  setStatusAction,
  updatePermissionsAction,
  type StaffActionState,
} from "./actions";

/**
 * A temporary password, shown once.
 *
 * It cannot be looked up again later - the database only keeps a scrambled
 * version - so the screen is blunt about writing it down now.
 */
function TemporaryPasswordNotice({
  value,
}: {
  value: { username: string; password: string };
}) {
  return (
    <Notice tone="attention" title="Write this down now - it is shown only once">
      <p className="mt-1">
        Give this temporary password to <strong>{value.username}</strong>. They
        will have to choose their own password the first time they sign in.
      </p>
      <p className="mt-3 select-all rounded-control bg-surface px-3 py-2 font-mono text-base tracking-wider ring-1 ring-line">
        {value.password}
      </p>
      <p className="mt-2 text-xs">
        Nobody can see it again after you leave this screen, not even you. If it
        is lost, reset the password to get a new one.
      </p>
    </Notice>
  );
}

export function CreateAccountForm({ assignable }: { assignable: Role[] }) {
  const [state, submit, pending] = useActionState<StaffActionState, FormData>(
    createAccountAction,
    {},
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <div className="space-y-5">
      {state.temporaryPassword ? (
        <TemporaryPasswordNotice value={state.temporaryPassword} />
      ) : null}
      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <form action={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" error={fieldErrors.fullName}>
            <Input name="fullName" required placeholder="e.g. Juan Dela Cruz" />
          </Field>

          <Field
            label="Username"
            hint="What they type to sign in. Lowercase, no spaces."
            error={fieldErrors.username}
          >
            <Input
              name="username"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. juan"
            />
          </Field>
        </div>

        <Field
          label="Role"
          hint={
            assignable.includes("admin")
              ? "Staff are limited by the checkboxes. Admins are not - give it to very few people."
              : "Admins can only create staff accounts."
          }
          error={fieldErrors.role}
        >
          <Select name="role" defaultValue="staff">
            {assignable.map((role) => (
              <option key={role} value={role}>
                {role === "admin" ? "Admin" : "Staff"}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}

export function PermissionsForm({
  userId,
  granted,
}: {
  userId: string;
  granted: Permission[];
}) {
  const [state, submit, pending] = useActionState<StaffActionState, FormData>(
    updatePermissionsAction,
    {},
  );

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />

      <div className="space-y-2.5">
        {PERMISSIONS.map((permission) => (
          <label key={permission} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="permissions"
              value={permission}
              defaultChecked={granted.includes(permission)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">{PERMISSION_INFO[permission].label}</span>
              <span className="block text-muted">
                {PERMISSION_INFO[permission].description}
              </span>
            </span>
          </label>
        ))}
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save permissions"}
      </Button>
    </form>
  );
}

export function RenameForm({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const [state, submit, pending] = useActionState<StaffActionState, FormData>(
    renameAccountAction,
    {},
  );

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <Field label="Full name" error={state.fieldErrors?.fullName}>
        <Input name="fullName" defaultValue={fullName} required />
      </Field>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const [state, submit, pending] = useActionState<StaffActionState, FormData>(
    resetPasswordAction,
    {},
  );

  return (
    <div className="space-y-3">
      {state.temporaryPassword ? (
        <TemporaryPasswordNotice value={state.temporaryPassword} />
      ) : null}
      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <form action={submit}>
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Resetting…" : `Reset ${username}'s password`}
        </Button>
      </form>
      <p className="text-xs text-muted">
        Gives them a new temporary password, which they must change when they
        next sign in. Their old password stops working immediately.
      </p>
    </div>
  );
}

export function StatusForm({
  userId,
  username,
  status,
}: {
  userId: string;
  username: string;
  status: "active" | "inactive";
}) {
  const [state, submit, pending] = useActionState<StaffActionState, FormData>(
    setStatusAction,
    {},
  );
  const next = status === "active" ? "inactive" : "active";

  return (
    <div className="space-y-3">
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <form action={submit} className="flex items-center gap-3">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value={next} />
        <Button
          type="submit"
          variant={next === "inactive" ? "danger" : "secondary"}
          disabled={pending}
        >
          {pending
            ? "Saving…"
            : next === "inactive"
              ? `Deactivate ${username}`
              : `Reactivate ${username}`}
        </Button>
        <Tag tone={status === "active" ? "success" : "attention"}>
          {status === "active" ? "Active" : "Deactivated"}
        </Tag>
      </form>
      <p className="text-xs text-muted">
        Deactivating keeps every record they entered. They simply cannot sign in
        any more.
      </p>
    </div>
  );
}
