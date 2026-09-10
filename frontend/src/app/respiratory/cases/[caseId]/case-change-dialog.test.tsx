import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CaseChangeDialog } from "./case-change-dialog";

describe("CaseChangeDialog", () => {
  it("traps focus and cancels with Escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();
    render(<><button ref={returnFocusRef}>Case A</button><CaseChangeDialog onCancel={onCancel} onDiscard={() => undefined} returnFocusRef={returnFocusRef} /></>);
    const cancel = screen.getByRole("button", { name: "계속 작성" });
    const discard = screen.getByRole("button", { name: "변경사항 버리고 이동" });
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(discard).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not dismiss on a background click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();
    render(<CaseChangeDialog onCancel={onCancel} onDiscard={() => undefined} returnFocusRef={returnFocusRef} />);
    await user.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
