import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MfdsProductSelector } from "./mfds-product-selector";

describe("MfdsProductSelector", () => {
  it("shows concise product details, conditionally labels withdrawn products, and keeps ITEM_SEQ for selection", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      products: [
        {
          item_seq: "123456",
          item_name: "타그리소정40밀리그램(오시머티닙메실산염)",
          entp_name: "한국아스트라제네카(주)",
          item_ingr_name: "Osimertinib Mesylate",
          approval_status: "APPROVED_OR_ACTIVE",
        },
        {
          item_seq: "654321",
          item_name: "취소 제품",
          entp_name: "제조사",
          item_ingr_name: "성분명",
          approval_status: "WITHDRAWN_OR_CANCELLED",
        },
      ],
    })));
    const onSelect = vi.fn().mockResolvedValue(undefined);

    render(
      <MfdsProductSelector
        ingredientName="Osimertinib"
        selectedItemSeq={null}
        apiBaseUrl="http://api.test"
        authorizedFetch={authorizedFetch}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "제품 선택" }));

    const activeProduct = await screen.findByRole("button", {
      name: /타그리소정40밀리그램.*한국아스트라제네카.*Osimertinib Mesylate/,
    });
    expect(activeProduct).toBeInTheDocument();
    expect(screen.getByText("허가 취소·취하")).toBeInTheDocument();
    expect(screen.queryByText(/ITEM_SEQ/)).not.toBeInTheDocument();
    expect(screen.queryByText("APPROVED_OR_ACTIVE")).not.toBeInTheDocument();

    fireEvent.click(activeProduct);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("123456"));
  });
});
