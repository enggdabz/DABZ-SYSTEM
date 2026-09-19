import { describe, expect, it } from "vitest";

import { isFunctionMissingFromApi } from "./postgrest";

describe("isFunctionMissingFromApi", () => {
  it("recognises the code PostgREST uses for a function it cannot find", () => {
    expect(
      isFunctionMissingFromApi({
        code: "PGRST202",
        message:
          "Could not find the function public.finish_password_change without parameters in the schema cache",
      }),
    ).toBe(true);
  });

  it("recognises the phrase when the code is missing", () => {
    expect(
      isFunctionMissingFromApi({ message: "not found in the schema cache" }),
    ).toBe(true);
  });

  /*
    The bug this test exists for. The first version matched the function's own
    name anywhere in the message, so a function that RAN and refused the call
    was reported as a missing migration - and the owner was told to push
    migrations that were already applied.
  */
  it("does NOT treat the function's own exception as a missing function", () => {
    expect(
      isFunctionMissingFromApi({
        code: "P0001",
        message: "Nobody is signed in.",
      }),
    ).toBe(false);

    expect(
      isFunctionMissingFromApi({
        code: "P0001",
        message: 'function finish_password_change: that account no longer exists',
      }),
    ).toBe(false);
  });

  it("does not mistake a permission error for a missing function", () => {
    expect(
      isFunctionMissingFromApi({
        code: "42501",
        message: "permission denied for function finish_password_change",
      }),
    ).toBe(false);
  });

  it("survives an error with no code and no message", () => {
    expect(isFunctionMissingFromApi({})).toBe(false);
    expect(isFunctionMissingFromApi({ code: null, message: null })).toBe(false);
  });
});
