/**
 * Tests for `/cohorts` (agents.md §10.3 task 7).
 *
 * `apiRequest` is exercised through a real `fetch` mock (not mocked itself), the same approach
 * `src/app/login/page.test.tsx` uses, so the request URL, method and the contract's response
 * shape are all real rather than assumed.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import CohortsPage from "./page";

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

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("cohorts list", () => {
  it("announces a loading state, then lists every cohort as a linked card", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, [
        { id: "a1", label: "September 2026", start_month: "2026-09-01", roster_entry_count: 12 },
        { id: "a2", label: "No start date", start_month: null, roster_entry_count: 3 },
      ]),
    );

    render(<CohortsPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading");

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /September 2026/ })).toBeDefined();
    });

    expect(screen.getByRole("link", { name: /September 2026/ }).getAttribute("href")).toBe(
      "/cohorts/a1",
    );
    expect(screen.getByRole("link", { name: /No start date/ }).getAttribute("href")).toBe(
      "/cohorts/a2",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/cohorts");
    expect(init.method).toBe("GET");
  });

  it("offers an upload action that links to the upload flow", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    render(<CohortsPage />);

    const upload = screen.getByRole("link", { name: "Upload roster" });
    expect(upload.getAttribute("href")).toBe("/cohorts/upload");
  });

  it("shows an empty state instead of a bare empty grid", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    render(<CohortsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No cohorts yet/)).toBeDefined();
    });
  });

  it("surfaces a failed load as an alert rather than an empty screen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("unauthorized", "not signed in")));
    render(<CohortsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load cohorts.");
  });
});
