/**
 * Tests for `/knowledge-base` (agents.md §10.5 task 13).
 *
 * `fetch` is mocked (there is no backend in a unit test), the same approach `cohorts/page.test.tsx`
 * uses for its own hand-rolled list fetch. Response bodies mirror `kayla.kb.schemas.
 * KbDocumentListResponse` (`{ documents: [...] }`, each row already carrying a pre-rendered
 * `status_display`), read directly from the concurrently-built backend.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import KnowledgeBasePage from "./page";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function envelope(code: string, message: string) {
  return { error: { code, message, details: {} } };
}

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    title: "Employee Handbook",
    filename: "handbook.pdf",
    version: 1,
    status: "uploaded",
    status_display: "Queued",
    page_count: 12,
    superseded_at: null,
    uploaded_by: "user-1",
    created_at: "2026-09-01T12:00:00Z",
    updated_at: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

function listResponse(status: number, documents: ReturnType<typeof document>[]) {
  return jsonResponse(status, { documents });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("knowledge base list", () => {
  it("announces a loading state, then lists every document with its exact status copy", async () => {
    fetchMock.mockResolvedValue(
      listResponse(200, [
        document({ status: "uploaded", status_display: "Queued" }),
        document({
          id: "doc-2",
          title: "PTO Policy",
          status: "indexed",
          status_display: "Indexed - 5 sections",
        }),
      ]),
    );

    render(<KnowledgeBasePage />);
    expect(screen.getByRole("status").textContent).toContain("Loading");

    await waitFor(() => {
      expect(screen.getByText("Employee Handbook")).toBeDefined();
    });

    expect(screen.getByText("Queued")).toBeDefined();
    expect(screen.getByText("Indexed - 5 sections")).toBeDefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/kb/documents");
    expect(init.method).toBe("GET");
  });

  it("offers an upload action that links to the upload flow", async () => {
    fetchMock.mockResolvedValue(listResponse(200, []));
    render(<KnowledgeBasePage />);

    const upload = screen.getByRole("link", { name: "Upload document" });
    expect(upload.getAttribute("href")).toBe("/knowledge-base/upload");
  });

  it("shows an empty state instead of a bare empty list", async () => {
    fetchMock.mockResolvedValue(listResponse(200, []));
    render(<KnowledgeBasePage />);

    await waitFor(() => {
      expect(screen.getByText(/No documents yet/)).toBeDefined();
    });
  });

  it("surfaces a failed load as an alert rather than an empty screen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("unauthorized", "not signed in")));
    render(<KnowledgeBasePage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load the knowledge base.");
  });

  it("polls again while a document is still processing, and stops once everything is terminal", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(listResponse(200, [document({ status: "parsing", status_display: "Processing" })]))
      .mockResolvedValueOnce(
        listResponse(200, [
          document({ status: "indexed", status_display: "Indexed - 3 sections" }),
        ]),
      );

    render(<KnowledgeBasePage />);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Every document is now terminal (`indexed`) — a further interval must not poll again.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
