import { describe, expect, it } from "vitest";

import {
  isColumnMissingFromApi,
  isFunctionMissingFromApi,
  missingColumnFromApi,
} from "./postgrest";

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

describe("isColumnMissingFromApi", () => {
  it("recognises the code PostgREST uses for a column it cannot find", () => {
    expect(
      isColumnMissingFromApi({
        code: "PGRST204",
        message:
          "Could not find the 'staff_stay_signed_in' column of 'app_settings' in the schema cache",
      }),
    ).toBe(true);
  });

  it("recognises the phrase when the code is missing", () => {
    expect(
      isColumnMissingFromApi({
        message: "Could not find the 'shop_phone' column of 'app_settings'",
      }),
    ).toBe(true);
  });

  /*
    PostgREST normally catches this against its own cache and answers PGRST204.
    When the statement reaches PostgreSQL instead, this is what comes back -
    the wording is different enough that the phrase above would miss it.
  */
  it("recognises PostgreSQL's own undefined_column code", () => {
    expect(
      isColumnMissingFromApi({
        code: "42703",
        message:
          'column "staff_stay_signed_in" of relation "app_settings" does not exist',
      }),
    ).toBe(true);
  });

  /*
    The same trap `isFunctionMissingFromApi` fell into once. A column named in
    some other kind of refusal has a different fix, and telling the owner to
    push migrations that are already applied sends them the wrong way.
  */
  it("does not treat a constraint or permission failure as a missing column", () => {
    expect(
      isColumnMissingFromApi({
        code: "23514",
        message:
          'new row for relation "app_settings" violates check constraint "app_settings_auto_logout_minutes_check"',
      }),
    ).toBe(false);

    expect(
      isColumnMissingFromApi({
        code: "42501",
        message: "permission denied for table app_settings",
      }),
    ).toBe(false);

    // A write refused by Row Level Security is the other one that must not be
    // reported as a missing migration: the fix is the person's role.
    expect(
      isColumnMissingFromApi({
        code: "42501",
        message:
          'new row violates row-level security policy for table "app_settings"',
      }),
    ).toBe(false);
  });

  it("is not confused by the MISSING FUNCTION message, which is the other fix", () => {
    expect(
      isColumnMissingFromApi({
        code: "PGRST202",
        message:
          "Could not find the function public.finish_password_change without parameters in the schema cache",
      }),
    ).toBe(false);
  });

  it("survives an error with no code and no message", () => {
    expect(isColumnMissingFromApi({})).toBe(false);
    expect(isColumnMissingFromApi({ code: null, message: null })).toBe(false);
  });
});

describe("missingColumnFromApi", () => {
  it("reads the name out of what PostgREST answers", () => {
    // Word for word what the owner's Settings screen showed on 21 Sep 2026.
    expect(
      missingColumnFromApi({
        code: "PGRST204",
        message:
          "Could not find the 'staff_stay_signed_in' column of 'app_settings' in the schema cache",
      }),
    ).toBe("staff_stay_signed_in");
  });

  it("reads the name out of both of PostgreSQL's wordings", () => {
    expect(
      missingColumnFromApi({
        code: "42703",
        message:
          'column "staff_stay_signed_in" of relation "app_settings" does not exist',
      }),
    ).toBe("staff_stay_signed_in");

    expect(
      missingColumnFromApi({
        code: "42703",
        message: "column app_settings.staff_stay_signed_in does not exist",
      }),
    ).toBe("staff_stay_signed_in");
  });

  it("takes the COLUMN, not the table it is on", () => {
    // The trap in the dotted wording: both names are there, and dropping the
    // table name from the write would do nothing at all.
    expect(
      missingColumnFromApi({
        code: "42703",
        message: "column app_settings.shop_phone does not exist",
      }),
    ).toBe("shop_phone");
  });

  it("answers null for anything that is not a missing column", () => {
    /*
      Null means "do not retry", and it has to. A guess here would drop a
      column the database actually HAS, and the owner would watch a setting
      they typed fail to stick with nothing on screen to explain it.
    */
    expect(
      missingColumnFromApi({
        code: "42501",
        message: "permission denied for table app_settings",
      }),
    ).toBeNull();
    expect(
      missingColumnFromApi({
        code: "23514",
        message:
          'new row for relation "app_settings" violates check constraint "app_settings_auto_logout_minutes_check"',
      }),
    ).toBeNull();
    expect(missingColumnFromApi({})).toBeNull();
  });

  it("answers null when it is a missing column but nobody said which", () => {
    expect(
      missingColumnFromApi({ code: "PGRST204", message: "could not find the column" }),
    ).toBeNull();
    expect(missingColumnFromApi({ code: "PGRST204" })).toBeNull();
  });
});
