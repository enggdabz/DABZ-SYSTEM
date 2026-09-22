import { describe, expect, it } from "vitest";

import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it("lets a customer reach the shop's public page", () => {
    expect(isPublicPath("/")).toBe(true);
  });

  it("lets a customer reach every page of the online shop", () => {
    /*
      The one that would be silent and total. A page left off the list sends
      everybody who taps a link from Facebook to a staff login screen - and
      only once Supabase is configured, so it works on a machine with no
      credentials and fails on the day it goes live.
    */
    for (const path of [
      "/shop",
      "/shop/designs",
      "/shop/designs/DJ-101",
      "/shop/products/full-sublimation-jersey",
      "/shop/order",
      "/shop/order/details",
      "/shop/order/received/abc123",
      "/shop/track",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it("lets a cron reach its own route", () => {
    // Both route handlers check a shared secret themselves and fail shut
    // without one. A redirect is a useless answer to a machine.
    expect(isPublicPath("/api/notifications/digest")).toBe(true);
    expect(isPublicPath("/api/online/purge-uploads")).toBe(true);
  });

  it("lets somebody sign in, and set the shop up the first time", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/setup")).toBe(true);
  });

  it("does NOT open the whole system just because the root is listed", () => {
    for (const path of [
      "/overview",
      "/pos",
      "/bills",
      "/ledger",
      "/payroll",
      "/settings",
      "/online-orders",
      "/online-orders/reports",
      "/online-orders/DA-0042",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it("is not fooled by a path that merely starts with a public one", () => {
    // "/shopfront" is not part of "/shop", and "/logins" is not "/login".
    expect(isPublicPath("/shopfront")).toBe(false);
    expect(isPublicPath("/logins")).toBe(false);
    expect(isPublicPath("/apidocs")).toBe(false);
  });
});
