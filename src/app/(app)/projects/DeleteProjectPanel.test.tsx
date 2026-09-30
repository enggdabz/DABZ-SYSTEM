// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  The real actions reach PostgreSQL. This is about what the SCREEN offers, so
  they are stubbed. What the actions and the database refuse is proven in
  deletion-actions.test.ts and supabase/tests/20_project_deletion_rls.test.sql.
*/
vi.mock("./deletion-actions", () => ({
  deleteProjectAction: vi.fn(async () => ({})),
  cancelDeletionRequestAction: vi.fn(async () => ({})),
}));

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

import { DeleteProjectPanel } from "./DeleteProjectPanel";

afterEach(cleanup);

const base = {
  projectId: "proj-1",
  projectNumber: "J-261001-001",
  customerName: "Coach Ramon",
  isOwner: false,
  pending: null,
  pendingUnknown: false,
};

const pending = {
  requestId: "req-1",
  requestedByName: "Maria",
  reason: "Duplicate entry",
  requestedOnLabel: "1 Oct 2026",
  canCancel: true,
};

describe("DeleteProjectPanel", () => {
  it("offers an admin a Delete project button that opens a reason modal", async () => {
    const user = userEvent.setup();
    render(<DeleteProjectPanel {...base} mode="request" />);

    await user.click(screen.getByRole("button", { name: "Delete project" }));

    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText(/why is it being deleted/i) as HTMLTextAreaElement)
        .required,
    ).toBe(true);
    // An admin is told the owner has to approve - not that it will vanish.
    expect(
      within(dialog).getByText(/owner has to approve this/i),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Send request to the owner" }),
    ).toBeTruthy();
  });

  it("tells the owner it deletes now", async () => {
    const user = userEvent.setup();
    render(<DeleteProjectPanel {...base} isOwner mode="delete" />);

    await user.click(screen.getByRole("button", { name: "Delete project" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/removes it from the lists/i)).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: /send request/i }),
    ).toBeNull();
  });

  it("closes the modal with Keep it, leaving no request behind", async () => {
    const user = userEvent.setup();
    render(<DeleteProjectPanel {...base} mode="request" />);

    await user.click(screen.getByRole("button", { name: "Delete project" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("swaps the delete button for the badge and Cancel request while pending", () => {
    render(<DeleteProjectPanel {...base} mode="request" pending={pending} />);

    expect(screen.getByText("Deletion pending owner approval")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Delete project" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Cancel request" }),
    ).toBeTruthy();
    // The warning carries a word and an icon, not colour alone.
    expect(screen.getByText(/cannot be edited or moved/i)).toBeTruthy();
  });

  it("does not offer Cancel request to an admin who did not ask", () => {
    render(
      <DeleteProjectPanel
        {...base}
        mode="request"
        pending={{ ...pending, canCancel: false }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Cancel request" }),
    ).toBeNull();
    expect(screen.getByText("Deletion pending owner approval")).toBeTruthy();
  });

  it("points the owner at the page where the answer is given", () => {
    render(<DeleteProjectPanel {...base} isOwner mode="delete" pending={pending} />);

    expect(
      screen
        .getByRole("link", { name: /deletion requests page/i })
        .getAttribute("href"),
    ).toBe("/projects/deletion-requests");
  });

  it("shows counter staff the badge without the details, and no buttons", () => {
    render(<DeleteProjectPanel {...base} mode="none" pendingUnknown />);

    expect(screen.getByText("Deletion pending owner approval")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Maria/)).toBeNull();
  });

  it("shows counter staff nothing at all when nothing is pending", () => {
    const { container } = render(<DeleteProjectPanel {...base} mode="none" />);
    expect(container.innerHTML).toBe("");
  });
});
