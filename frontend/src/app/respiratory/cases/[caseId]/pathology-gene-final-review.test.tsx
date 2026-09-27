import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PathologyGeneFinalReview } from "./pathology-gene-final-review";

const result = {
  id: "result-1",
  result_status: "DRAFT",
  result_detail: {
    gene: {
      findings: [
        { gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: null },
        { gene_symbol: "BRAF", assessment: "LIKELY_NEGATIVE", alteration_code: null },
        { gene_symbol: "MET", assessment: "LIKELY_NEGATIVE", alteration_code: null },
        { gene_symbol: "KRAS", assessment: "LIKELY_NEGATIVE", alteration_code: null },
      ],
    },
  },
};

const props = { caseId: "case-1", apiBaseUrl: "http://test", clinicalResult: result };

describe("PathologyGeneFinalReview", () => {
  it("blocks confirmation while a positive actionable gene has no alteration", () => {
    const authorizedFetch = vi.fn();
    render(<PathologyGeneFinalReview {...props} authorizedFetch={authorizedFetch} />);

    expect(screen.getByText("EGFR 양성 결과는 구체적인 변이 유형을 확인해야 합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "검토 결과 확정" })).toBeDisabled();
    expect(authorizedFetch).not.toHaveBeenCalled();
  });

  it("sends every reviewed finding through the existing confirm endpoint", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result_status: "CONFIRMED" }), { status: 200 }),
    );
    const onConfirmed = vi.fn();
    render(<PathologyGeneFinalReview {...props} authorizedFetch={authorizedFetch} onConfirmed={onConfirmed} />);

    fireEvent.change(screen.getByLabelText("EGFR 세부 변이"), { target: { value: "EGFR_EX19_DEL" } });
    fireEvent.click(screen.getByRole("button", { name: "검토 결과 확정" }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(authorizedFetch).toHaveBeenCalledWith(
      "http://test/api/doctor/cases/case-1/clinical-results/pathology/result-1/confirm/",
      expect.objectContaining({ method: "POST" }),
    );
    const payload = JSON.parse(authorizedFetch.mock.calls[0][1].body);
    expect(payload.gene_findings).toHaveLength(4);
    expect(payload.gene_findings).toContainEqual({
      gene_symbol: "EGFR",
      assessment: "LIKELY_POSITIVE",
      alteration_code: "EGFR_EX19_DEL",
    });
  });

  it("normalizes other or unknown alteration to indeterminate without a target code", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result_status: "CONFIRMED" }), { status: 200 }),
    );
    render(<PathologyGeneFinalReview {...props} authorizedFetch={authorizedFetch} />);

    fireEvent.change(screen.getByLabelText("EGFR 세부 변이"), { target: { value: "OTHER_UNKNOWN" } });
    expect(screen.getByLabelText("EGFR 임상 상태")).toHaveValue("INDETERMINATE");
    fireEvent.click(screen.getByRole("button", { name: "검토 결과 확정" }));

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(authorizedFetch.mock.calls[0][1].body);
    expect(payload.gene_findings[0]).toEqual({
      gene_symbol: "EGFR",
      assessment: "INDETERMINATE",
      alteration_code: null,
    });
  });
});
