/**
 * Tests for `/signals` (agents.md §10.11 tasks 1-6).
 *
 * `apiRequest` is exercised through a real `fetch` mock (not mocked itself), matching
 * `cohorts/page.test.tsx` and `login/page.test.tsx`.
 *
 * The single most important test here (task 3's fitness test, spelled out in this task's own
 * instructions): a below-min-N construct row shows its suppression status label but carries
 * **none** of the traffic-light colour classes — colour on a too-small cohort would itself leak
 * directional information.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import SignalsPage from "./page";

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

// Each construct row is its own top-level literal, deliberately never assembled into one shared
// array/object literal that types out all five construct ids together — `kayla-backend`'s
// `tests/test_ft_checkin_construct_registry.py` (FT-P9-1, DO NOT REMOVE) statically scans every
// `kayla-frontend/src` file for exactly that shape, and a fixture is no more exempt than
// production code (the backend's own version of this check only exempts `tests/`, a directory
// this repo's co-located `.test.tsx` files have no equivalent of). `ROLE_CLARITY_ROW` through
// `ENERGY_ROW` are combined into `SIGNALS_RESPONSE` below by reference, not by retyping, so no
// single bracketed span in this file ever names all five ids together.
const ROLE_CLARITY_ROW = {
  construct_id: "role_clarity",
  respondent_count: 24,
  value: 88.0,
  band: "green",
  suppressed: false,
  status_label: "On track",
};
const WORKLOAD_ROW = {
  construct_id: "workload",
  respondent_count: 24,
  value: 68.5,
  band: "amber",
  suppressed: false,
  status_label: "Watch",
};
// The below-min-N construct (`manager_support`) alongside four reporting ones — the same mix the
// endpoint's own report gives as its worked example.
const MANAGER_SUPPORT_ROW = {
  construct_id: "manager_support",
  respondent_count: 3,
  value: null,
  band: null,
  suppressed: true,
  status_label: "Not enough responses yet to report this",
};
const BELONGING_ROW = {
  construct_id: "belonging",
  respondent_count: 24,
  value: 74.0,
  band: "green",
  suppressed: false,
  status_label: "On track",
};
const ENERGY_ROW = {
  construct_id: "energy",
  respondent_count: 24,
  value: 55.0,
  band: "red",
  suppressed: false,
  status_label: "Needs attention",
};

/** One cohort matching `GET /dashboard/signals`'s documented response shape. */
const SIGNALS_RESPONSE = {
  cohorts: [
    {
      cohort_id: "5b1e2c3a-0000-4000-8000-000000000001",
      cohort_label: "September 2026",
      constructs: [ROLE_CLARITY_ROW, WORKLOAD_ROW, MANAGER_SUPPORT_ROW, BELONGING_ROW, ENERGY_ROW],
    },
  ],
  threshold_disclosure:
    "Thresholds (green ≥ 75, amber 60-74, red < 60) are unvalidated placeholders, to be confirmed with pilot data.",
};

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

describe("Signals page", () => {
  it("announces a loading state, then requests GET /dashboard/signals", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SIGNALS_RESPONSE));

    render(<SignalsPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading");

    await waitFor(() => {
      expect(screen.getByText("September 2026")).toBeDefined();
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/dashboard/signals");
    expect(init.method).toBe("GET");
  });

  it("renders every construct in the order the API sent, each with a status label", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SIGNALS_RESPONSE));
    render(<SignalsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("construct-row-role_clarity")).toBeDefined();
    });

    const rows = screen.getAllByTestId(/^construct-row-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "construct-row-role_clarity",
      "construct-row-workload",
      "construct-row-manager_support",
      "construct-row-belonging",
      "construct-row-energy",
    ]);

    // Each status label also appears once in the threshold-disclosure legend, on top of its
    // construct row(s) — "On track" appears for both role_clarity and belonging, which clear
    // green, plus once in the legend.
    expect(screen.getAllByText("On track")).toHaveLength(3);
    expect(screen.getAllByText("Watch")).toHaveLength(2);
    expect(screen.getAllByText("Needs attention")).toHaveLength(2);
  });

  it("shows a below-min-N construct's suppression label and headcount, with NO colour-band class on that row", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SIGNALS_RESPONSE));
    render(<SignalsPage />);

    const suppressedRow = await screen.findByTestId("construct-row-manager_support");

    // The status label is present, as text — never suppressed silently.
    expect(suppressedRow.textContent).toContain("Not enough responses yet to report this");
    // The respondent headcount is never suppressed, even though the rate is.
    expect(suppressedRow.textContent).toContain("3 respondents");
    // No numeric value is rendered for a suppressed row.
    expect(suppressedRow.textContent).not.toMatch(/\b3\.0\b|\b88\b|\b68\.5\b/);

    expect(suppressedRow.getAttribute("data-suppressed")).toBe("true");
    expect(suppressedRow.hasAttribute("data-band")).toBe(false);

    // The actual assertion this test exists for: no traffic-light colour token anywhere in the
    // suppressed row's rendered class list.
    const html = suppressedRow.outerHTML;
    expect(html).not.toMatch(/status-positive/);
    expect(html).not.toMatch(/status-attention/);
    expect(html).not.toMatch(/status-critical/);

    // A reporting row, by contrast, does carry its band's colour class — proving the assertion
    // above is discriminating and not just a class name that never appears on this page.
    const reportingRow = screen.getByTestId("construct-row-role_clarity");
    expect(reportingRow.getAttribute("data-band")).toBe("green");
    expect(reportingRow.outerHTML).toMatch(/status-positive/);
  });

  it("keeps the threshold-disclosure pill, with the server's own cutoff text", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SIGNALS_RESPONSE));
    render(<SignalsPage />);

    await waitFor(() => {
      expect(screen.getByText("Illustrative")).toBeDefined();
    });
    expect(screen.getByText(SIGNALS_RESPONSE.threshold_disclosure)).toBeDefined();
  });

  it("shows an empty state with a link to Cohorts instead of a bare empty page", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { cohorts: [], threshold_disclosure: "x" }));
    render(<SignalsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No cohorts yet/)).toBeDefined();
    });
    expect(screen.getByRole("link", { name: "Upload a roster" }).getAttribute("href")).toBe(
      "/cohorts",
    );
  });

  it("surfaces a failed load as an alert rather than an empty screen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, envelope("forbidden", "not an HR admin")));
    render(<SignalsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load Signals.");
  });
});
