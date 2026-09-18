/**
 * Usernames, temporary passwords and the failed-attempt lockout (spec 4.1).
 *
 * WHY USERNAMES AND NOT EMAIL
 * Staff at a print shop counter should not need an email address to clock into
 * work. Supabase Auth identifies people by email, so each username is mapped
 * to an internal address like `juan@staff.dabz.local`. That address is never
 * shown to staff and no mail is ever sent to it - it is only Supabase's
 * internal name for the account.
 */
import { randomInt } from "node:crypto";

/** The made-up mail domain used for the internal addresses described above. */
export const INTERNAL_EMAIL_DOMAIN = "staff.dabz.local";

/**
 * Usernames are lowercase, 3-30 characters, letters/digits with dots,
 * underscores or hyphens inside. Kept deliberately narrow: it must be easy to
 * type on a phone at 7am and impossible to confuse with someone else's.
 *
 * The same rule is enforced by a CHECK constraint in the database, so a
 * mismatch here cannot let a bad username through.
 */
const USERNAME_PATTERN = /^[a-z0-9]([a-z0-9._-]{1,28}[a-z0-9])$/;

export type UsernameCheck =
  | { ok: true; username: string }
  | { ok: false; reason: string };

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function checkUsername(input: string): UsernameCheck {
  const username = normalizeUsername(input);

  if (username === "") {
    return { ok: false, reason: "Enter a username." };
  }
  if (username.length < 3) {
    return { ok: false, reason: "A username needs at least 3 characters." };
  }
  if (username.length > 30) {
    return { ok: false, reason: "A username can be at most 30 characters." };
  }
  if (/\s/.test(username)) {
    return { ok: false, reason: "A username cannot contain spaces." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason:
        "Use only letters, numbers, dots, underscores or hyphens, starting and ending with a letter or number.",
    };
  }

  return { ok: true, username };
}

/** "juan" -> "juan@staff.dabz.local". Throws on a username we would reject. */
export function usernameToInternalEmail(username: string): string {
  const checked = checkUsername(username);
  if (!checked.ok) {
    throw new Error(`Cannot build a login address: ${checked.reason}`);
  }
  return `${checked.username}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** The reverse, for showing who an account belongs to. */
export function internalEmailToUsername(email: string): string | null {
  const suffix = `@${INTERNAL_EMAIL_DOMAIN}`;
  if (!email.endsWith(suffix)) return null;
  return email.slice(0, -suffix.length);
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/** Supabase's own minimum is 6; 8 is a reasonable shop-wide floor. */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

export function checkPassword(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password.length > 72) {
    // bcrypt ignores anything past 72 bytes, so a longer one is false comfort.
    return { ok: false, reason: "A password can be at most 72 characters." };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      ok: false,
      reason: "Use at least one letter and one number.",
    };
  }
  return { ok: true };
}

/*
  Characters for temporary passwords, with the confusable ones removed:
  no O/0, no I/l/1. The owner has to read these out loud or write them on
  paper, so "was that a one or an ell" is a real cost.
*/
const TEMP_PASSWORD_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const TEMP_PASSWORD_DIGITS = "23456789";

/**
 * A temporary password for a new account or a password reset (spec 4.1).
 *
 * Uses the operating system's secure random source, not Math.random: a
 * guessable temporary password would be a real way into the shop's money.
 */
export function generateTemporaryPassword(length = 10): string {
  if (length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `A temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const pool = TEMP_PASSWORD_LETTERS + TEMP_PASSWORD_DIGITS;

  // Guarantee the result satisfies checkPassword by placing one letter and one
  // digit first, then filling the rest and shuffling.
  const characters = [
    TEMP_PASSWORD_LETTERS[randomInt(TEMP_PASSWORD_LETTERS.length)],
    TEMP_PASSWORD_DIGITS[randomInt(TEMP_PASSWORD_DIGITS.length)],
  ];
  while (characters.length < length) {
    characters.push(pool[randomInt(pool.length)]);
  }

  // Fisher-Yates, so the letter and digit are not always in front.
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }

  return characters.join("");
}

// ---------------------------------------------------------------------------
// Failed-attempt lockout (spec 4.1)
// ---------------------------------------------------------------------------

/** Lock the account after this many failures in a row. */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long the lock lasts. */
export const LOCKOUT_MINUTES = 15;

export interface LoginAttempt {
  outcome: "success" | "wrong_password" | "unknown_user" | "locked_out" | "inactive_account";
  occurredAt: Date;
}

export interface LockoutState {
  locked: boolean;
  /** Failures counted towards the lock. */
  failures: number;
  attemptsRemaining: number;
  /** When the lock lifts, if locked. */
  unlocksAt?: Date;
}

/**
 * Works out whether an account is locked, from its recent login attempts.
 *
 * Only failures inside the last 15 minutes count, and a successful login
 * clears the slate - so a staff member who mistypes twice on Monday and twice
 * on Friday is not locked out.
 *
 * Kept as a pure function (attempts in, answer out) so it can be tested
 * without a database or a clock.
 */
export function evaluateLockout(
  attempts: readonly LoginAttempt[],
  now: Date = new Date(),
): LockoutState {
  const windowStart = new Date(now.getTime() - LOCKOUT_MINUTES * 60_000);

  // Newest first, so we can stop at the most recent success.
  const recent = [...attempts]
    .filter((attempt) => attempt.occurredAt > windowStart)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  let failures = 0;
  let oldestCountedFailure: Date | undefined;

  for (const attempt of recent) {
    if (attempt.outcome === "success") break;
    // A previous "locked_out" is a symptom, not a new wrong guess; counting it
    // would extend the lock every time the person tried the door.
    if (attempt.outcome === "locked_out") continue;
    failures += 1;
    oldestCountedFailure = attempt.occurredAt;
  }

  const locked = failures >= MAX_FAILED_ATTEMPTS;

  return {
    locked,
    failures,
    attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - failures),
    unlocksAt:
      locked && oldestCountedFailure
        ? new Date(oldestCountedFailure.getTime() + LOCKOUT_MINUTES * 60_000)
        : undefined,
  };
}

/** "3 minutes" / "1 minute" / "less than a minute", for the login screen. */
export function describeTimeUntil(target: Date, now: Date = new Date()): string {
  const remainingMs = target.getTime() - now.getTime();
  // Anything under a full minute reads better as "less than a minute" than as
  // "1 minute", which sounds like a promise the clock will not keep.
  if (remainingMs < 60_000) return "less than a minute";
  const minutes = Math.ceil(remainingMs / 60_000);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
