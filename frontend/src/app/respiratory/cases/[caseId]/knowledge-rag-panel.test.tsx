import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeRagPanel } from "./knowledge-rag-panel";

describe("KnowledgeRagPanel", () => {
  it("shows the answer and retrieved document sources from the API", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ answer: "EGFR 근거 답변", sources: [{ document: "폐암 진료지침", chunk_index: 0, distance: 0.12 }] }), { status: 200 }));
    render(<KnowledgeRagPanel apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "EGFR 치료 근거" } });
    fireEvent.click(screen.getByRole("button", { name: "질의" }));

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith("http://api.test/api/knowledge/ask/", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("EGFR 근거 답변")).toBeTruthy();
    expect(screen.getByText("[1] 폐암 진료지침")).toBeTruthy();
  });

  it("numbers displayed sources by retrieval order rather than document chunk index", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ answer: "[1] First source. [2] Second source.", sources: [{ document: "First source", chunk_index: 8, distance: 0.12, excerpt: "First evidence excerpt", source_uri: "https://example.test/first" }, { document: "Second source", chunk_index: 1, distance: 0.18, source_uri: "javascript:alert(1)" }] }), { status: 200 }));
    render(<KnowledgeRagPanel apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "citation check" } });
    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(await screen.findByText("[1] First source")).toBeTruthy();
    expect(screen.getByText("[2] Second source")).toBeTruthy();
    expect(screen.getByText("First evidence excerpt")).toBeTruthy();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.test/first");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("shows the API error without inventing an answer", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "MedGemma 연결 실패" }), { status: 502 }));
    render(<KnowledgeRagPanel apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "질문" } });
    fireEvent.click(screen.getByRole("button", { name: "질의" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("MedGemma 연결 실패");
    expect(screen.queryByText("EGFR 근거 답변")).toBeNull();
  });

  it("retries the same real question after a transient API failure", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "temporary failure" }), { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer: "retried answer", sources: [] }), { status: 200 }));
    render(<KnowledgeRagPanel apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "retry question" } });
    fireEvent.click(screen.getAllByRole("button")[0]);
    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button"));

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("retried answer")).toBeTruthy();
  });
});
