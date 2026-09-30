// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DatabaseBehind } from "./DatabaseBehind";

afterEach(cleanup);

describe("DatabaseBehind", () => {
  it("names the migration and the command, with a warning icon and words", () => {
    render(
      <DatabaseBehind
        migration="0023_project_deletion_requests"
        canOpenSystemCheck
      />,
    );
    expect(
      screen.getByText("The database is behind this version of the app"),
    ).toBeTruthy();
    expect(screen.getByText("0023_project_deletion_requests")).toBeTruthy();
    expect(screen.getByText("npm run db:push")).toBeTruthy();
    expect(screen.getByText("⚠")).toBeTruthy();
  });

  it("links owner and admin to System check", () => {
    render(<DatabaseBehind migration="0023_x" canOpenSystemCheck />);
    expect(
      screen.getByRole("link", { name: "Open System check" }).getAttribute("href"),
    ).toBe("/system");
  });

  it("sends counter staff to the owner instead of a page they cannot open", () => {
    render(<DatabaseBehind migration="0023_x" canOpenSystemCheck={false} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/Tell the owner or an admin/)).toBeTruthy();
  });
});
