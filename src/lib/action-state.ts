/**
 * Shared shape for server-action results.
 *
 * This lives outside every "use server" module on purpose: such a module may
 * only export async functions, so a constant like `emptyActionState` declared
 * beside its actions makes the whole route fail at request time — and, because
 * these routes are dynamic, the build still passes. Keep it here.
 */
export type ActionState = { error: string | null; notice: string | null };

export const emptyActionState: ActionState = { error: null, notice: null };
