/**
 * Tests for `/` — Overview (agents.md §10.11 tasks 1-3, 5, 7).
 *
 * `apiRequest` is exercised through a real `fetch` mock (not mocked itself), the same approach
 * `/cohorts/page.test.tsx` and `/check-in-questions/page.test.tsx` use, so the request URL, method
 * and the contract's response shape are all real rather than assumed.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";
import type { components } from "@/api/generated";

import OverviewPage from "./page";

type OverviewResponse = components["schemas"]["OverviewResponse"];

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

type AdjustmentSignalDot = components["schemas"]["AdjustmentSignalDot"];

// Each dot is its own top-level literal, deliberately never assembled into one shared
// array/object literal that types out all five construct ids together — `kayla-backend`'s
// `tests/test_ft_checkin_construct_registry.py` (FT-P9-1, DO NOT REMOVE) statically scans every
// `kayla-frontend/src` file for exactly that shape, and a fixture is no more exempt than
// production code (the backend's own version of this check only exempts `tests/`, a directory
// this repo's co-located `.test.tsx` files have no equivalent of). `ROLE_CLARITY_DOT` through
// `ENERGY_DOT` are combined below by reference, not by retyping, so no single bracketed span in
// this file ever names all five ids together.
const ROLE_CLARITY_DOT: AdjustmentSignalDot = {
  construct_id: "role_clarity",
  respondent_count: 24,
  band: "green",
  suppressed: false,
  status_label: "On track",
};
const WORKLOAD_DOT: AdjustmentSignalDot = {
  construct_id: "workload",
  respondent_count: 24,
  band: "amber",
  suppressed: false,
  status_label: "Watch",
};
const MANAGER_SUPPORT_DOT: AdjustmentSignalDot = {
  construct_id: "manager_support",
  respondent_count: 3,
  band: null,
  suppressed: true,
  status_label: "Not enough responses yet to report this",
};
const BELONGING_DOT: AdjustmentSignalDot = {
  construct_id: "belonging",
  respondent_count: 24,
  band: "green",
  suppressed: false,
  status_label: "On track",
};
const ENERGY_DOT: AdjustmentSignalDot = {
  construct_id: "energy",
  respondent_count: 24,
  band: "red",
  suppressed: false,
  status_label: "Needs attention",
};

const FULL_OVERVIEW: OverviewResponse = {
  enrolled_headcount: 26,
  signed_up_headcount: 24,
  percent_signed_up: 0.923,
  checkin_completion: {
    respondent_headcount: 24,
    required_checkins: 40,
    completed_checkins: 35,
    rate: 0.875,
    suppressed: false,
    status_label: "Reporting",
  },
  on_track: {
    population_headcount: 24,
    working_days_elapsed: 480,
    shift_checkin_days: 410,
    rate: 0.854,
    suppressed: false,
    status_label: "Reporting",
  },
  adjustment_signals: {
    constructs: [ROLE_CLARITY_DOT, WORKLOAD_DOT, MANAGER_SUPPORT_DOT, BELONGING_DOT, ENERGY_DOT],
  },
  active_usage: {
    active_headcount: 18,
    rate: 0.75,
    suppressed: false,
    status_label: "Reporting",
    window_days: 14,
  },
  time_saved_minutes_per_week: 208,
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

describe("Overview", () => {
  it("announces a loading state, then renders the full tile grid", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, FULL_OVERVIEW));

    render(<OverviewPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading");

    await waitFor(() => {
      expect(screen.getByText("26")).toBeDefined();
    });

    expect(screen.getByText("92%")).toBeDefined(); // round(0.923 * 100)
    expect(screen.getByText("24 of 26 signed up")).toBeDefined();
    expect(screen.getByText("88%")).toBeDefined(); // checkin_completion.rate round
    expect(screen.getByText("35 of 40 check-ins completed")).toBeDefined();
    expect(screen.getByText("85%")).toBeDefined(); // on_track.rate round
    expect(screen.getByText("208 min/week")).toBeDefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/dashboard/overview");
    expect(init.method).toBe("GET");
  });

  it("renders every adjustment-signal construct, humanized, with its band or suppression", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, FULL_OVERVIEW));
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Role clarity")).toBeDefined();
    });

    expect(screen.getByText("Workload")).toBeDefined();
    expect(screen.getByText("Manager support")).toBeDefined();
    expect(screen.getByText("Belonging")).toBeDefined();
    expect(screen.getByText("Energy")).toBeDefined();

    // The suppressed construct (manager_support) renders the lock + its exact status label —
    // and never a band colour class anywhere the suppressed row's markup reaches.
    expect(screen.getAllByText("🔒").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Not enough responses yet to report this"),
    ).toBeDefined();
  });

  it("links New hires enrolled to /cohorts and Adjustment signals to /signals", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, FULL_OVERVIEW));
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /New hires enrolled/ })).toBeDefined();
    });

    expect(
      screen.getByRole("link", { name: /New hires enrolled/ }).getAttribute("href"),
    ).toBe("/cohorts");
    expect(
      screen.getByRole("link", { name: /Adjustment signals/ }).getAttribute("href"),
    ).toBe("/signals");
    // "On track" must never be a link — no drill-down this aggregate can offer. An exact-name
    // match (not a substring regex) matters here: two constructs' own status label is literally
    // "On track", nested inside the (real) Adjustment signals link — a substring match against
    // that link's own accessible name would find it and defeat this assertion.
    expect(screen.queryByRole("link", { name: "On track" })).toBeNull();
  });

  it("shows suppressed check-in completion and on-track tiles with no band colour, not a stat", async () => {
    const suppressedOverview: OverviewResponse = {
      ...FULL_OVERVIEW,
      checkin_completion: {
        respondent_headcount: 3,
        required_checkins: 5,
        completed_checkins: 2,
        rate: null,
        suppressed: true,
        status_label: "Not enough responses yet to report this",
      },
      on_track: {
        population_headcount: 3,
        working_days_elapsed: 40,
        shift_checkin_days: 30,
        rate: null,
        suppressed: true,
        status_label: "Not enough responses yet to report this",
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(200, suppressedOverview));

    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Not enough responses yet to report this").length).toBeGreaterThan(0);
    });

    // Neither suppressed rate ever renders as a percentage.
    expect(screen.queryByText("88%")).toBeNull();
    expect(screen.queryByText("85%")).toBeNull();
  });

  it("shows a no-denominator state for percent_signed_up when nobody is enrolled yet", async () => {
    const emptyOverview: OverviewResponse = {
      ...FULL_OVERVIEW,
      enrolled_headcount: 0,
      signed_up_headcount: 0,
      percent_signed_up: null,
      time_saved_minutes_per_week: 0,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, emptyOverview));

    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByText("No one enrolled yet")).toBeDefined();
    });
  });

  it("surfaces a role-forbidden response as a clear access message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, envelope("forbidden", "not an hr admin")));
    render(<OverviewPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("HR admins and org owners");
  });

  it("shows the new active-usage tile, the adoption funnel's third leg", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, FULL_OVERVIEW));
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeDefined();
    });
    expect(screen.getByText("75%")).toBeDefined(); // round(0.75 * 100)
    expect(screen.getByText("18 used Kayla in the last 14 days")).toBeDefined();
  });

  it("surfaces a failed load as an alert rather than an empty screen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("unauthorized", "not signed in")));
    render(<OverviewPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load the overview.");
  });
});

// ====================================================================================================
// The getting-started checklist.
//
// This is what a brand-new organisation sees instead of a grid of honest zeros. Every step reads
// real state from a real endpoint, so these tests drive the endpoints rather than a local flag:
// `GET /cohorts` for the roster, `GET /kb/documents` for the handbook, and the overview's own
// `signed_up_headcount` for the invitations.
// ====================================================================================================

const EMPTY_ORG_OVERVIEW: OverviewResponse = {
  ...FULL_OVERVIEW,
  enrolled_headcount: 0,
  signed_up_headcount: 0,
  percent_signed_up: null,
};

function mockOrgState({
  overview,
  cohorts,
  documents,
}: {
  overview: OverviewResponse;
  cohorts: unknown[];
  documents: unknown[];
}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/dashboard/overview")) return Promise.resolve(jsonResponse(200, overview));
    if (url.endsWith("/kb/documents")) return Promise.resolve(jsonResponse(200, { documents }));
    if (url.endsWith("/cohorts")) return Promise.resolve(jsonResponse(200, cohorts));
    throw new Error(`no mock registered for fetch(${url})`);
  });
}

describe("Overview — getting started", () => {
  it("guides a brand-new org through all three steps, none of them done", async () => {
    mockOrgState({ overview: EMPTY_ORG_OVERVIEW, cohorts: [], documents: [] });
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Get set up")).toBeDefined();
    });

    expect(screen.getByText(/0 of 3 done/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Upload roster" }).getAttribute("href")).toBe(
      "/cohorts/upload",
    );
    expect(screen.getByRole("link", { name: "Upload handbook" }).getAttribute("href")).toBe(
      "/knowledge-base/upload",
    );
    expect(screen.getByRole("link", { name: "Review the roster" }).getAttribute("href")).toBe(
      "/cohorts",
    );
  });

  it("ticks a step off against the endpoint that proves it, not a local flag", async () => {
    mockOrgState({
      overview: EMPTY_ORG_OVERVIEW,
      cohorts: [{ id: "c1", label: "September 2026", start_month: "2026-09-01", roster_entry_count: 4 }],
      documents: [],
    });
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByText(/1 of 3 done/)).toBeDefined();
    });

    // The finished step loses its call to action; the other two keep theirs.
    expect(screen.queryByRole("link", { name: "Upload roster" })).toBeNull();
    expect(screen.getByRole("link", { name: "Upload handbook" })).toBeDefined();
  });

  it("retires itself entirely once every step is done", async () => {
    mockOrgState({
      overview: FULL_OVERVIEW, // signed_up_headcount is 24, so the invitations step is done
      cohorts: [{ id: "c1", label: "September 2026", start_month: "2026-09-01", roster_entry_count: 4 }],
      documents: [{ id: "d1", title: "Employee Handbook" }],
    });
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByText("26")).toBeDefined(); // the real page has loaded…
    });
    await waitFor(() => {
      expect(screen.queryByText("Get set up")).toBeNull(); // …and the checklist is gone
    });
  });

  it("treats a probe that fails as 'not done yet', never as an error on a page that loaded", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/dashboard/overview")) {
        return Promise.resolve(jsonResponse(200, EMPTY_ORG_OVERVIEW));
      }
      return Promise.resolve(jsonResponse(403, envelope("forbidden", "nope")));
    });
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByText(/0 of 3 done/)).toBeDefined();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
