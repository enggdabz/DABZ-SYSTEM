import { describe, expect, it } from "vitest";

import {
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
  checkPassword,
  checkUsername,
  describeTimeUntil,
  evaluateLockout,
  generateTemporaryPassword,
  internalEmailToUsername,
  normalizeUsername,
  usernameToInternalEmail,
  type LoginAttempt,
} from "./credentials";

describe("checkUsername", () => {
  it("accepts the kind of username staff would pick", () => {
    for (const name of ["eddie", "juan.dc", "maria_2", "rosa-g", "abc", "tech01"]) {
      const result = checkUsername(name);
      expect(result, name).toMatchObject({ ok: true });
    }
  });

  it("tidies up what was typed", () => {
    expect(checkUsername("  Eddie  ")).toEqual({ ok: true, username: "eddie" });
    expect(normalizeUsername(" JUAN ")).toBe("juan");
  });

  it("explains why a username is refused, in plain words", () => {
    expect(checkUsername("")).toMatchObject({ ok: false });
    expect(checkUsername("ab")).toMatchObject({
      ok: false,
      reason: "A username needs at least 3 characters.",
    });
    expect(checkUsername("a".repeat(31))).toMatchObject({ ok: false });
    expect(checkUsername("juan dela cruz")).toMatchObject({
      ok: false,
      reason: "A username cannot contain spaces.",
    });
    // Must start and end with a letter or number.
    expect(checkUsername(".juan")).toMatchObject({ ok: false });
    expect(checkUsername("juan.")).toMatchObject({ ok: false });
    expect(checkUsername("ju@n")).toMatchObject({ ok: false });
  });

  it("agrees with the database CHECK constraint", () => {
    // The same pattern guards the profiles table, so anything accepted here
    // must be storable there. Length is the boundary worth pinning down.
    expect(checkUsername("abc")).toMatchObject({ ok: true });
    expect(checkUsername("a".repeat(30))).toMatchObject({ ok: true });
    expect(checkUsername("a".repeat(31))).toMatchObject({ ok: false });
  });
});

describe("internal email mapping", () => {
  it("maps a username to the address Supabase stores", () => {
    expect(usernameToInternalEmail("juan")).toBe("juan@staff.dabz.local");
    expect(usernameToInternalEmail("  EDDIE ")).toBe("eddie@staff.dabz.local");
  });

  it("maps back again", () => {
    expect(internalEmailToUsername("juan@staff.dabz.local")).toBe("juan");
    expect(internalEmailToUsername("someone@gmail.com")).toBeNull();
  });

  it("refuses to build an address from a bad username", () => {
    expect(() => usernameToInternalEmail("juan dela cruz")).toThrow();
  });
});

describe("checkPassword", () => {
  it("accepts a reasonable password", () => {
    expect(checkPassword("dabz2017shop")).toEqual({ ok: true });
  });

  it("refuses passwords that are too short, too long, or too simple", () => {
    expect(checkPassword("short1")).toMatchObject({ ok: false });
    expect(checkPassword("a".repeat(73) + "1")).toMatchObject({ ok: false });
    expect(checkPassword("onlyletters")).toMatchObject({
      ok: false,
      reason: "Use at least one letter and one number.",
    });
    expect(checkPassword("12345678")).toMatchObject({ ok: false });
  });
});

describe("generateTemporaryPassword", () => {
  it("always produces a password the system would accept", () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword();
      expect(checkPassword(password), password).toEqual({ ok: true });
    }
  });

  it("leaves out characters that are misread when written down", () => {
    const confusable = /[O0Il1]/;
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword(12);
      expect(confusable.test(password), password).toBe(false);
    }
  });

  it("honours the requested length and refuses a weak one", () => {
    expect(generateTemporaryPassword(16)).toHaveLength(16);
    expect(() => generateTemporaryPassword(4)).toThrow();
  });

  it("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i += 1) seen.add(generateTemporaryPassword());
    expect(seen.size).toBe(300);
  });
});

describe("evaluateLockout", () => {
  const now = new Date("2026-09-18T10:00:00Z");

  function failures(count: number, minutesAgoStart = 1): LoginAttempt[] {
    return Array.from({ length: count }, (_, index) => ({
      outcome: "wrong_password" as const,
      occurredAt: new Date(now.getTime() - (minutesAgoStart + index) * 60_000),
    }));
  }

  it("leaves an account open when there are no failures", () => {
    expect(evaluateLockout([], now)).toMatchObject({
      locked: false,
      failures: 0,
      attemptsRemaining: MAX_FAILED_ATTEMPTS,
    });
  });

  it("counts down the attempts remaining", () => {
    expect(evaluateLockout(failures(1), now).attemptsRemaining).toBe(4);
    expect(evaluateLockout(failures(4), now)).toMatchObject({
      locked: false,
      attemptsRemaining: 1,
    });
  });

  it("locks the account on the fifth failure in a row", () => {
    const state = evaluateLockout(failures(MAX_FAILED_ATTEMPTS), now);
    expect(state.locked).toBe(true);
    expect(state.attemptsRemaining).toBe(0);
    expect(state.unlocksAt).toBeInstanceOf(Date);
  });

  it("forgets failures older than the lockout window", () => {
    const old = Array.from({ length: 5 }, (_, index) => ({
      outcome: "wrong_password" as const,
      occurredAt: new Date(now.getTime() - (LOCKOUT_MINUTES + 1 + index) * 60_000),
    }));
    expect(evaluateLockout(old, now)).toMatchObject({ locked: false, failures: 0 });
  });

  it("clears the slate after a successful login", () => {
    // Four misses, then the right password, then one more miss today.
    const attempts: LoginAttempt[] = [
      ...failures(4, 5),
      { outcome: "success", occurredAt: new Date(now.getTime() - 4 * 60_000) },
      { outcome: "wrong_password", occurredAt: new Date(now.getTime() - 1 * 60_000) },
    ];
    expect(evaluateLockout(attempts, now)).toMatchObject({
      locked: false,
      failures: 1,
      attemptsRemaining: 4,
    });
  });

  it("does not extend the lock just because someone tried the door again", () => {
    // Five real failures, then three attempts that were already refused.
    const attempts: LoginAttempt[] = [
      ...failures(5, 3),
      { outcome: "locked_out", occurredAt: new Date(now.getTime() - 2 * 60_000) },
      { outcome: "locked_out", occurredAt: new Date(now.getTime() - 1 * 60_000) },
    ];
    const state = evaluateLockout(attempts, now);
    expect(state.locked).toBe(true);
    expect(state.failures).toBe(5);
    // The lock still lifts 15 minutes after the oldest counted failure.
    const oldestFailure = new Date(now.getTime() - 7 * 60_000);
    expect(state.unlocksAt?.getTime()).toBe(
      oldestFailure.getTime() + LOCKOUT_MINUTES * 60_000,
    );
  });

  it("counts an unknown username as a failure too", () => {
    // Otherwise someone could guess usernames all day without ever tripping it.
    const attempts: LoginAttempt[] = Array.from({ length: 5 }, (_, index) => ({
      outcome: "unknown_user" as const,
      occurredAt: new Date(now.getTime() - (index + 1) * 60_000),
    }));
    expect(evaluateLockout(attempts, now).locked).toBe(true);
  });
});

describe("describeTimeUntil", () => {
  const now = new Date("2026-09-18T10:00:00Z");

  it("reads the way a person would say it", () => {
    expect(describeTimeUntil(new Date(now.getTime() + 3 * 60_000), now)).toBe("3 minutes");
    expect(describeTimeUntil(new Date(now.getTime() + 60_000), now)).toBe("1 minute");
    expect(describeTimeUntil(new Date(now.getTime() + 10_000), now)).toBe("less than a minute");
    expect(describeTimeUntil(new Date(now.getTime() - 60_000), now)).toBe("less than a minute");
  });
});
