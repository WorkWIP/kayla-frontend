/**
 * The 90-day milestone-completion dual-line chart on `/engagement` (agents.md §10.11 task 8,
 * `GET /dashboard/engagement`).
 *
 * A hand-rolled inline `<svg>`, ported from the demo's own `EngagementTrendChart.tsx` shape — no
 * charting library, matching agents.md §3.2's pinned stack (which lists none) and the demo, which
 * hand-rolls the identical chart itself. Colour comes from this repo's generated tokens via
 * `stroke="currentColor"` on each line combined with a `text-*` utility on its wrapping `<g>` —
 * the exact pattern `sidebar-nav.tsx`'s own icon glyphs already use — never the demo's raw
 * `var(--color-primary-500)` references, which are that file's own CSS variables and do not exist
 * in this repo's token set (agents.md R5).
 *
 * --------------------------------------------------------------------------------------------
 * Real vs. illustrative comparison line — both cases, rendered differently on purpose
 * --------------------------------------------------------------------------------------------
 * `EngagementResponse.comparison_mode` tells this component which of three states applies, and it
 * renders each one differently rather than assuming the demo's "always illustrative" case:
 * - `real_previous_cohort` — a genuine earlier cohort's own trend. Drawn solid, in a second real
 *   colour (`--color-action-secondary`), so two real lines are visually distinct from each other
 *   by colour *and* by the legend text next to each swatch (agents.md §5.5: colour is never the
 *   only signal) — never dashed, which would misrepresent real history as a mocked shape.
 * - `illustrative_previous_cohort` — no real comparison history exists yet. Drawn dashed and in
 *   the same muted, neutral tone (`--color-text-tertiary`) `SuppressedNotice` uses, so "this is
 *   not real data" reads from the line style itself, not only from `comparison_disclaimer`'s text
 *   underneath it.
 * - `no_comparison_data` — `comparisonTrend` is empty; no second line or legend entry renders at
 *   all.
 *
 * --------------------------------------------------------------------------------------------
 * Suppressed points never draw a fabricated line segment
 * --------------------------------------------------------------------------------------------
 * `buildPath` breaks into a new SVG subpath at every `null` value (a suppressed
 * `MilestoneTrendPoint` always carries `completion_pct: null`) rather than interpolating across
 * it or drawing it as zero — a Day-90 the org has not reached yet must never look like "0%
 * completion," which is a directional, band-adjacent claim `suppressed` exists to prevent.
 *
 * --------------------------------------------------------------------------------------------
 * The `<svg>` is decorative; the real accessible data lives in a table underneath it
 * --------------------------------------------------------------------------------------------
 * Rather than port the demo's hover/focus tooltip over invisible SVG hit-rects (a screen-reader
 * user gets nothing from that until they happen to tab onto exactly the right rect, and a
 * suppressed point has no numeric position to hit-test in the first place), this component marks
 * the `<svg>` `aria-hidden="true"` and renders one real `<table>` below it with the same data —
 * milestone day, this cohort's completion (or `SuppressedNotice` when suppressed, so the lock +
 * label rule applies here exactly as it does on every other suppressible field on this dashboard),
 * and the comparison column when one applies. The chart is a visual reinforcement of that table,
 * not a second source of truth.
 */

import type { components } from "@/api/generated";

import { SuppressedNotice } from "./suppressed-notice";

type MilestoneTrendPoint = components["schemas"]["MilestoneTrendPoint"];
type ComparisonTrendPoint = components["schemas"]["ComparisonTrendPoint"];
type ComparisonMode = components["schemas"]["EngagementResponse"]["comparison_mode"];

export interface EngagementTrendChartProps {
  /** Always exactly 4 points, days 7/30/60/90 (`EngagementResponse.current_trend`'s own
   * guarantee) — this component does not assume that length, only that every point in the array
   * shares one x-axis position with the same index into `comparisonTrend`. */
  readonly currentTrend: readonly MilestoneTrendPoint[];
  readonly currentLabel: string;
  readonly comparisonMode: ComparisonMode;
  /** Exactly as many points as `currentTrend` when `comparisonMode !== "no_comparison_data"`,
   * else empty (`EngagementResponse.comparison_trend`'s own guarantee). */
  readonly comparisonTrend: readonly ComparisonTrendPoint[];
  readonly comparisonLabel: string;
}

const WIDTH = 600;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 32, left: 36 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const GRID_LINES = [0, 50, 100] as const;

function xFor(index: number, count: number): number {
  return count <= 1 ? PAD.left : PAD.left + (index * PLOT_W) / (count - 1);
}

function yFor(percent: number): number {
  return PAD.top + PLOT_H - (percent / 100) * PLOT_H;
}

/** One `M`/`L` SVG path, broken into a new subpath at every `null` — see the module docstring. */
function buildPath(values: readonly (number | null)[]): string {
  let path = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${xFor(index, values.length)},${yFor(value)} `;
    drawing = true;
  });
  return path.trim();
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function EngagementTrendChart({
  currentTrend,
  currentLabel,
  comparisonMode,
  comparisonTrend,
  comparisonLabel,
}: EngagementTrendChartProps) {
  const currentValues = currentTrend.map((point) =>
    point.suppressed || point.completion_pct === null ? null : point.completion_pct * 100,
  );
  const comparisonValues = comparisonTrend.map((point) =>
    point.completion_pct === null ? null : point.completion_pct * 100,
  );
  const showComparison = comparisonMode !== "no_comparison_data" && comparisonTrend.length > 0;
  const illustrative = comparisonMode === "illustrative_previous_cohort";

  return (
    <div className="flex flex-col gap-16">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" className="w-full">
        {GRID_LINES.map((value) => (
          <g key={value} className="text-hairline-cool">
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yFor(value)}
              y2={yFor(value)}
              stroke="currentColor"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={yFor(value)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-text-tertiary text-micro"
            >
              {`${value}%`}
            </text>
          </g>
        ))}

        {showComparison ? (
          <g className={illustrative ? "text-text-tertiary" : "text-action-secondary"}>
            <path
              d={buildPath(comparisonValues)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray={illustrative ? "6 5" : undefined}
              strokeLinecap="round"
            />
          </g>
        ) : null}

        <g className="text-action-primary">
          <path
            d={buildPath(currentValues)}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {currentTrend.map((point, index) =>
            point.suppressed || point.completion_pct === null ? null : (
              <circle
                key={point.milestone_day}
                cx={xFor(index, currentTrend.length)}
                cy={yFor(point.completion_pct * 100)}
                r={4}
                fill="currentColor"
              />
            ),
          )}
        </g>

        {currentTrend.map((point, index) => (
          <text
            key={point.milestone_day}
            x={xFor(index, currentTrend.length)}
            y={HEIGHT - 10}
            textAnchor="middle"
            className="fill-text-tertiary text-micro"
          >
            {`Day ${point.milestone_day}`}
          </text>
        ))}
      </svg>

      <div className="flex flex-wrap items-center gap-16 text-meta text-text-secondary">
        <span className="inline-flex items-center gap-8">
          <span aria-hidden="true" className="h-2 w-16 rounded-full bg-action-primary" />
          {currentLabel}
        </span>
        {showComparison ? (
          <span className="inline-flex items-center gap-8">
            <svg
              width={16}
              height={4}
              aria-hidden="true"
              className={illustrative ? "text-text-tertiary" : "text-action-secondary"}
            >
              <line
                x1={0}
                y1={2}
                x2={16}
                y2={2}
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray={illustrative ? "4 3" : undefined}
              />
            </svg>
            {comparisonLabel}
          </span>
        ) : null}
      </div>

      <table className="w-full border-collapse text-left text-copy">
        <caption className="sr-only">{`${currentLabel} milestone check-in completion, by day`}</caption>
        <thead>
          <tr className="border-b border-hairline-lilac text-meta font-bold uppercase tracking-eyebrow-tight text-text-tertiary">
            <th scope="col" className="py-8 pr-16 font-bold">
              Milestone
            </th>
            <th scope="col" className="py-8 pr-16 font-bold">
              {currentLabel}
            </th>
            {showComparison ? (
              <th scope="col" className="py-8 font-bold">
                {comparisonLabel}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {currentTrend.map((point, index) => {
            const comparisonPoint: ComparisonTrendPoint | undefined = comparisonTrend[index];
            return (
              <tr key={point.milestone_day} className="border-b border-hairline-lilac last:border-b-0">
                <th scope="row" className="py-8 pr-16 font-medium text-text-primary">
                  {`Day ${point.milestone_day}`}
                </th>
                <td className="py-8 pr-16">
                  {point.suppressed ? (
                    <SuppressedNotice statusLabel={point.status_label} />
                  ) : (
                    <span className="text-text-primary">
                      {point.completion_pct === null ? "—" : formatPercent(point.completion_pct)}
                      <span className="ml-8 text-meta text-text-tertiary">
                        {`(${point.completed_count} of ${point.required_count})`}
                      </span>
                    </span>
                  )}
                </td>
                {showComparison ? (
                  <td className="py-8 text-text-primary">
                    {comparisonPoint === undefined || comparisonPoint.completion_pct === null
                      ? "—"
                      : formatPercent(comparisonPoint.completion_pct)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default EngagementTrendChart;
