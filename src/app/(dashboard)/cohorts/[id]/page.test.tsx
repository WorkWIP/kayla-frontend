/**
 * Tests for `/cohorts/[id]` (agents.md §10.3 task 7).
 *
 * This page makes its request directly against `fetch` rather than through `apiRequest` (see
 * the page's own docstring for why); the test mocks `fetch` the same way `login/page.test.tsx`
 * mocks it for `apiRequest`, so the same assertions apply — a real URL, a real method, the
 * contract's real response shape.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import CohortDetailPage from "./page";

const nav = vi.hoisted(() => ({ id: "a1" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: nav.id }),
}));

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
  nav.id = "a1";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DETAIL = {
  cohort: { id: "a1", label: "September 2026", start_month: "2026-09-01", roster_entry_count: 2 },
  entries: [
    {
      id: "e1",
      first_name: "Alex",
      last_name: "Rivera",
      email: "alex.rivera@example.com",
      start_date: "2026-09-14",
      site_name: "Riverside Clinic",
      role_title: "Home Health Aide",
      has_matched_user: true,
    },
    {
      id: "e2",
      first_name: "Sam",
      last_name: "Okafor",
      email: "sam.okafor@example.com",
      start_date: null,
      site_name: null,
      role_title: null,
      has_matched_user: false,
    },
  ],
};

describe("cohort detail", () => {
  it("requests the real cohort id and renders every entry as a table row", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, DETAIL));

    render(<CohortDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("September 2026");
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/cohorts/a1");
    expect(init.method).toBe("GET");

    const table = screen.getByRole("table");
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Last name", "First name", "Email", "Start date", "Site", "Role"]);

    expect(table.textContent).toContain("Rivera");
    expect(table.textContent).toContain("alex.rivera@example.com");
    expect(table.textContent).toContain("Riverside Clinic");
    expect(table.textContent).toContain("Home Health Aide");

    // The second entry has no start date, site or role — never invented, rendered as an
    // explicit placeholder instead of a blank cell.
    const rows = screen.getAllByRole("row");
    const okaforRow = rows.find((row) => row.textContent?.includes("Okafor"));
    expect(okaforRow?.textContent).toContain("—");

    // Never rendered: this screen has no column for has_matched_user, mood, signal or check-in
    // status (agents.md §10.3 task 7 / PRD §7).
    expect(table.textContent).not.toMatch(/mood|signal|check-?in/i);
  });

  it("renders a not-found message for a 404 rather than an empty table", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, envelope("not_found", "no such cohort")));

    render(<CohortDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/No cohort with this id/)).toBeDefined();
    });
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("surfaces a failed load as an alert", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("unauthorized", "no")));

    render(<CohortDetailPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load this cohort.");
  });
});
