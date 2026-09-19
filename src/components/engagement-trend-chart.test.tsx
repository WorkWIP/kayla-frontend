/**
 * Tests for `EngagementTrendChart` (agents.md §10.11 task 8).
 *
 * The `<svg>` is `aria-hidden`, so these tests exercise the real accessible surface — the table
 * underneath it — rather than parsing `<path d>` attributes, matching the component's own
 * docstring on why the table exists at all. Covers all three `comparison_mode` values (never
 * assuming "always illustrative") and a suppressed current-trend point rendering via
 * `SuppressedNotice`.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { components } from "@/api/generated";

import { EngagementTrendChart } from "./engagement-trend-chart";

afterEach(() => {
  cleanup();
});

type MilestoneTrendPoint = components["schemas"]["MilestoneTrendPoint"];
type ComparisonTrendPoint = components["schemas"]["ComparisonTrendPoint"];

const CURRENT_TREND: readonly MilestoneTrendPoint[] = [
  { milestone_day: 7, required_count: 24, completed_count: 22, completion_pct: 0.917, suppressed: false, status_label: "Reporting" },
  { milestone_day: 30, required_count: 24, completed_count: 20, completion_pct: 0.833, suppressed: false, status_label: "Reporting" },
  { milestone_day: 60, required_count: 18, completed_count: 14, completion_pct: 0.778, suppressed: false, status_label: "Reporting" },
  { milestone_day: 90, required_count: 0, completed_count: 0, completion_pct: null, suppressed: true, status_label: "Not enough responses yet to report this" },
];

const ILLUSTRATIVE_COMPARISON: readonly ComparisonTrendPoint[] = [
  { milestone_day: 7, completion_pct: 0.89 },
  { milestone_day: 30, completion_pct: 0.76 },
  { milestone_day: 60, completion_pct: 0.71 },
  { milestone_day: 90, completion_pct: 0.74 },
];

describe("EngagementTrendChart", () => {
  it("renders every milestone day and this cohort's completion in an accessible table", () => {
    render(
      <EngagementTrendChart
        currentTrend={CURRENT_TREND}
        currentLabel="September 2026"
        comparisonMode="no_comparison_data"
        comparisonTrend={[]}
        comparisonLabel="No comparison yet"
      />,
    );

    expect(screen.getByRole("columnheader", { name: "September 2026" })).toBeDefined();
    expect(screen.getByRole("rowheader", { name: "Day 7" })).toBeDefined();
    expect(screen.getByRole("rowheader", { name: "Day 90" })).toBeDefined();
    expect(screen.getByText("92%")).toBeDefined(); // round(0.917 * 100)
    expect(screen.getByText("(22 of 24)")).toBeDefined();
  });

  it("renders a suppressed milestone via SuppressedNotice — no fabricated percentage", () => {
    render(
      <EngagementTrendChart
        currentTrend={CURRENT_TREND}
        currentLabel="September 2026"
        comparisonMode="no_comparison_data"
        comparisonTrend={[]}
        comparisonLabel="No comparison yet"
      />,
    );

    expect(
      screen.getByText("Not enough responses yet to report this"),
    ).toBeDefined();
    expect(screen.getByText("🔒")).toBeDefined();
  });

  it("renders no comparison column at all when comparison_mode is no_comparison_data", () => {
    render(
      <EngagementTrendChart
        currentTrend={CURRENT_TREND}
        currentLabel="September 2026"
        comparisonMode="no_comparison_data"
        comparisonTrend={[]}
        comparisonLabel="No comparison yet"
      />,
    );

    expect(screen.queryByRole("columnheader", { name: "No comparison yet" })).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });

  it("renders a real previous cohort's comparison column, not marked illustrative", () => {
    render(
      <EngagementTrendChart
        currentTrend={CURRENT_TREND}
        currentLabel="September 2026"
        comparisonMode="real_previous_cohort"
        comparisonTrend={ILLUSTRATIVE_COMPARISON}
        comparisonLabel="August 2026"
      />,
    );

    expect(screen.getByRole("columnheader", { name: "August 2026" })).toBeDefined();
    expect(screen.getByText("89%")).toBeDefined(); // round(0.89 * 100)
  });

  it("renders an illustrative previous cohort's comparison column when flagged illustrative", () => {
    render(
      <EngagementTrendChart
        currentTrend={CURRENT_TREND}
        currentLabel="September 2026"
        comparisonMode="illustrative_previous_cohort"
        comparisonTrend={ILLUSTRATIVE_COMPARISON}
        comparisonLabel="Illustrative previous cohort"
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Illustrative previous cohort" }),
    ).toBeDefined();
    expect(screen.getByText("89%")).toBeDefined();
  });
});
