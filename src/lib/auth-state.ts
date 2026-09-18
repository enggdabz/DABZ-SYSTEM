/** Shared by the sign-in server action and the client form that calls it. */
export type AuthState = { error: string | null };

export const emptyAuthState: AuthState = { error: null };
