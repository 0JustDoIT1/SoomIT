import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { RecentPatients, useRecentPatients } from "./recent-patients";
import { useState } from "react";

function Harness({ storageKey }: { storageKey: string }) {
  const recent = useRecentPatients(storageKey);
  const [selected, select] = useState<string | null>(null);
  return <><RecentPatients patients={recent.patients} selectedId={selected} onSelect={p => { select(p.case_id); recent.remember(p); }} />
    {Array.from({ length: 13 }, (_, index) => index + 1).map(id => <button key={id} onClick={() => recent.remember({ case_id: String(id), patient_name: `Name${id}`, birth_date: "2000-01-01" })}>add{id}</button>)}</>;
}
beforeEach(() => sessionStorage.clear());
for (const storageKey of ["radiologyRecentPatients", "pathologyRecentPatients"]) {
  it(`${storageKey}: twelve most recent, deduplication, restoration and highlight`, async () => {
    const user = userEvent.setup();
    const view = render(<Harness storageKey={storageKey} />);
    expect(screen.getByText("최근 본 환자가 없습니다.")).toBeInTheDocument();
    for (let id=1; id<=13; id++) await user.click(screen.getByText(`add${id}`));
    const rail = within(screen.getByRole("complementary"));
    expect(rail.getAllByRole("button")).toHaveLength(12);
    expect(rail.queryByText("Name1")).not.toBeInTheDocument();
    await user.click(rail.getByText("Name3"));
    expect(rail.getAllByRole("button")[0]).toHaveTextContent("Name3");
    expect(rail.getAllByRole("button")[0]).toHaveAttribute("aria-pressed", "true");
    expect(Object.keys(JSON.parse(sessionStorage.getItem(storageKey)!)[0])).toEqual(["case_id", "patient_name", "birth_date"]);
    view.unmount(); render(<Harness storageKey={storageKey} />);
    await waitFor(() => expect(screen.getByText("Name3")).toBeInTheDocument());
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });
}
it("invalid storage does not break rendering", async () => {
  sessionStorage.setItem("radiologyRecentPatients", "bad-json");
  render(<Harness storageKey="radiologyRecentPatients" />);
  await waitFor(() => expect(screen.getByText("최근 본 환자가 없습니다.")).toBeInTheDocument());
});
