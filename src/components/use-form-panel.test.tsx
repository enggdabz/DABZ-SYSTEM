// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useActionState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useFormPanel } from "./use-form-panel";

interface State {
  success?: string;
  error?: string;
}

/*
  A panel of the shape the whole app uses: a button, and a form under it that
  opens and closes without the component itself ever unmounting. The action is
  a plain function here - what is being tested is what the SCREEN does with
  the answer, not what the server does with the form.
*/
function Panel({ answers }: { answers: State[] }) {
  const [state, submit, pending] = useActionState<State, FormData>(
    async () => answers.shift() ?? { success: "Saved." },
    {},
  );
  const { open, answer, openPanel, closePanel } = useFormPanel(state);

  if (!open) {
    return (
      <div>
        <button type="button" onClick={openPanel}>
          Add one
        </button>
        {answer.success ? <p>{answer.success}</p> : null}
        {answer.error ? <p>{answer.error}</p> : null}
      </div>
    );
  }

  return (
    <form action={submit}>
      {answer.success ? <p>{answer.success}</p> : null}
      {answer.error ? <p>{answer.error}</p> : null}
      <button type="submit" disabled={pending}>
        Save
      </button>
      <button type="button" onClick={closePanel}>
        Cancel
      </button>
    </form>
  );
}

/** Open the panel, save, and wait for the answer to appear. */
async function saveOnce(user: ReturnType<typeof userEvent.setup>, said: string) {
  await user.click(screen.getByRole("button", { name: "Add one" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText(said);
}

afterEach(cleanup);

describe("a panel that opens under a button", () => {
  it("keeps the answer beside the button after closing", async () => {
    const user = userEvent.setup();
    render(<Panel answers={[{ success: "PHP 35.00 added." }]} />);

    await saveOnce(user, "PHP 35.00 added.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Still there: it is the receipt for what just happened.
    expect(screen.getByText("PHP 35.00 added.")).toBeTruthy();
  });

  it("does not open on last time's answer", async () => {
    const user = userEvent.setup();
    render(<Panel answers={[{ success: "PHP 35.00 added." }]} />);

    await saveOnce(user, "PHP 35.00 added.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add one" }));

    expect(screen.queryByText("PHP 35.00 added.")).toBeNull();
  });

  it("does not open on last time's refusal either", async () => {
    const user = userEvent.setup();
    render(<Panel answers={[{ error: "That could not be saved." }]} />);

    await saveOnce(user, "That could not be saved.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add one" }));

    expect(screen.queryByText("That could not be saved.")).toBeNull();
  });

  it("shows the new answer, not the one before it", async () => {
    const user = userEvent.setup();
    render(
      <Panel answers={[{ success: "First." }, { success: "Second." }]} />,
    );

    await saveOnce(user, "First.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await saveOnce(user, "Second.");

    expect(screen.queryByText("First.")).toBeNull();
    expect(screen.getByText("Second.")).toBeTruthy();
  });
});
