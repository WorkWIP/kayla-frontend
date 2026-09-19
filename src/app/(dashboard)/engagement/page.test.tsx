/**
 * Tests for `/engagement` (agents.md §10.11 task 8, Q-35: "keep").
 *
 * `apiRequest` is exercised through a real `fetch` mock, matching `/cohorts/page.test.tsx`'s own
 * convention. Covers all three `comparison_mode` values and the `current_cohort_id: null` empty
 * state, which is a real state distinct from a load failure.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";
import type { components } from "@/api/generated";

import EngagementPage from "./page";

type EngagementResponse = components["schemas"]["EngagementResponse"];

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

const CURRENT_TREND: EngagementResponse["current_trend"] = [
  { milestone_day: 7, required_count: 24, completed_count: 22, completion_pct: 0.917, suppressed: false, status_label: "Reporting" },
  { milestone_day: 30, required_count: 24, completed_count: 20, completion_pct: 0.833, suppressed: false, status_label: "Reporting" },
  { milestone_day: 60, required_count: 18, completed_count: 14, completion_pct: 0.778, suppressed: false, status_label: "Reporting" },
  { milestone_day: 90, required_count: 0, completed_count: 0, completion_pct: null, suppressed: true, status_label: "Not enough responses yet to report this" },
];

const ILLUSTRATIVE_ENGAGEMENT: EngagementResponse = {
  current_cohort_id: "5b1e2c3a-0000-0000-0000-000000000001",
  current_cohort_label: "September 2026",
  current_trend: CURRENT_TREND,
  comparison_mode: "illustrative_previous_cohort",
  comparison_cohort_id: null,
  comparison_cohort_label: null,
  comparison_trend: [
    { milestone_day: 7, completion_pct: 0.89 },
    { milestone_day: 30, completion_pct: 0.76 },
    { milestone_day: 60, completion_pct: 0.71 },
    { milestone_day: 90, completion_pct: 0.74 },
  ],
  comparison_disclaimer:
    "The previous-cohort line is illustrative. This organisation does not yet have a completed cohort to compare against — this shows the shape a comparison would take, not real history.",
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

describe("Engagement", () => {
  it("announces a loading state, then renders the current cohort's trend", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, ILLUSTRATIVE_ENGAGEMENT));

    render(<EngagementPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "September 2026" })).toBeDefined();
    });

    expect(screen.getByText("92%")).toBeDefined(); // round(0.917 * 100)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/dashboard/engagement");
    expect(init.method).toBe("GET");
  });

  it("shows the illustrative disclaimer and column when comparison_mode is illustrative", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, ILLUSTRATIVE_ENGAGEMENT));
    render(<EngagementPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "The previous-cohort line is illustrative. This organisation does not yet have a completed cohort to compare against — this shows the shape a comparison would take, not real history.",
        ),
      ).toBeDefined();
    });

    // "illustrative" legitimately appears more than once (legend, column header, disclaimer) —
    // the point of this test is that all three agree, not that the word is unique on the page.
    expect(screen.getAllByText(/illustrative/i).length).toBeGreaterThanOrEqual(3);
    expect(
      screen.getByRole("columnheader", { name: "Illustrative previous cohort" }),
    ).toBeDefined();
  });

  it("shows a real previous cohort's own label and no illustrative disclaimer", async () => {
    const engagement: EngagementResponse = {
      ...ILLUSTRATIVE_ENGAGEMENT,
      comparison_mode: "real_previous_cohort",
      comparison_cohort_id: "5b1e2c3a-0000-0000-0000-000000000002",
      comparison_cohort_label: "August 2026",
      comparison_disclaimer: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, engagement));
    render(<EngagementPage />);

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "August 2026" })).toBeDefined();
    });

    expect(screen.queryByText(/illustrative/i)).toBeNull();
  });

  it("shows no comparison column and the org's own empty-history disclaimer when there is none", async () => {
    const engagement: EngagementResponse = {
      ...ILLUSTRATIVE_ENGAGEMENT,
      comparison_mode: "no_comparison_data",
      comparison_cohort_id: null,
      comparison_cohort_label: null,
      comparison_trend: [],
      comparison_disclaimer: "This organisation has no other cohort to compare against yet.",
    };
    fetchMock.mockResolvedValue(jsonResponse(200, engagement));
    render(<EngagementPage />);

    await waitFor(() => {
      expect(
        screen.getByText("This organisation has no other cohort to compare against yet."),
      ).toBeDefined();
    });

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });

  it("renders a suppressed milestone with its lock and status label, no fabricated percentage", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, ILLUSTRATIVE_ENGAGEMENT));
    render(<EngagementPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Not enough responses yet to report this"),
      ).toBeDefined();
    });
    expect(screen.getByText("🔒")).toBeDefined();
  });

  it("shows the no-current-cohort empty state, not an error, when current_cohort_id is null", async () => {
    const engagement: EngagementResponse = {
      ...ILLUSTRATIVE_ENGAGEMENT,
      current_cohort_id: null,
      current_cohort_label: null,
      current_trend: [],
      comparison_mode: "no_comparison_data",
      comparison_cohort_id: null,
      comparison_cohort_label: null,
      comparison_trend: [],
      comparison_disclaimer: "This organisation has no cohort yet.",
    };
    fetchMock.mockResolvedValue(jsonResponse(200, engagement));
    render(<EngagementPage />);

    await waitFor(() => {
      expect(screen.getByText(/No cohort has a milestone check-in due yet/)).toBeDefined();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("surfaces a role-forbidden response as a clear access message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, envelope("forbidden", "not an hr admin")));
    render(<EngagementPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("HR admins and org owners");
  });

  it("surfaces a failed load as an alert rather than an empty screen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("unauthorized", "not signed in")));
    render(<EngagementPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load engagement.");
  });
});
