/**
 * The landing page's hero illustration: the 90-day journey, drawn.
 *
 * --------------------------------------------------------------------------------------------
 * What replaced what, and why
 * --------------------------------------------------------------------------------------------
 * The right half of `/` used to be the brand mark at size, cropped by the window. It was
 * striking and it said nothing: a visitor who does not already know the logo learned only that
 * there is a letter K. Half the front door was spent on decoration.
 *
 * This says what the product is instead. The rising line is a new hire's first ninety days; the
 * nodes on it are the milestone check-ins at day 7, 30, 60 and 90; the two cards beside it are
 * the two things an employer actually gets — a cohort's completion, and adjustment signals
 * reported as bands rather than as anyone's answers. It is the product's own shape, abstracted.
 *
 * --------------------------------------------------------------------------------------------
 * Abstract, and deliberately not a screenshot
 * --------------------------------------------------------------------------------------------
 * Nothing here carries a number, a label or a name. That is a constraint, not a style choice:
 * `kb/MVP-SPEC.md` §5.5 makes "no invented statistics" a property of this page, and
 * `(marketing)/page.test.tsx` enforces it by allowing exactly one numeral — the `90` in the
 * sentence beside this drawing — anywhere in the rendered page. An SVG `<text>` node counts
 * toward that, so the bars and dots below stand in for figures rather than quoting any.
 *
 * It is also why the cards are shapes rather than a mock dashboard: a fake screenshot with
 * plausible-looking percentages on the public page would be exactly the claim the product
 * cannot stand behind.
 *
 * `kb/design_system/readme.md` bans photography, textures, mesh gradients and `backdrop-filter`.
 * This uses none of them — flat fills, hairline strokes, and the design system's own inks.
 *
 * --------------------------------------------------------------------------------------------
 * Colour
 * --------------------------------------------------------------------------------------------
 * Every colour arrives as `currentColor` inherited from a `text-*` utility on the enclosing
 * `<g>`, the pattern `engagement-trend-chart.tsx` and `sidebar-nav.tsx`'s glyphs already use.
 * No `fill="#..."` anywhere, so a palette change moves this drawing with it (agents.md R5).
 *
 * --------------------------------------------------------------------------------------------
 * Motion
 * --------------------------------------------------------------------------------------------
 * Slow and small: the line traces itself once on load, the nodes fade in behind it in order, and
 * the cards drift by four percent of their own height over twelve to eighteen seconds on
 * deliberately unrelated cycles, so they never fall into step.
 *
 * Every keyframe lives inside `@media (prefers-reduced-motion: no-preference)` in `globals.css`,
 * which means the reduced-motion rendering is the finished composition standing still — not a
 * degraded one. Durations and delays are passed inline because they differ per element; the
 * rules themselves are in the stylesheet.
 *
 * A Server Component: no state, no handlers, nothing to hydrate. `/` is the one page in the app
 * that has to paint before a bundle boots, and a `"use client"` here would pull its whole subtree
 * into the browser for a drawing that never changes.
 *
 * `aria-hidden`, with no accessible name. It is decoration: every claim it gestures at is made in
 * words in the copy beside it, and describing it to a screen reader would be repetition.
 */

/** The journey's four milestone nodes, as fractions along the path's bounding geometry. */
interface Milestone {
  readonly cx: number;
  readonly cy: number;
  /** Which ink the node carries — the bands a cohort's signals actually come back in. */
  readonly tone: string;
  /** Seconds. Each node lands just after the traced line reaches it. */
  readonly delay: string;
}

const MILESTONES: readonly Milestone[] = [
  { cx: 44, cy: 300, tone: "text-action-secondary", delay: "0.5s" },
  { cx: 168, cy: 232, tone: "text-action-secondary", delay: "1.1s" },
  { cx: 300, cy: 178, tone: "text-status-attention", delay: "1.7s" },
  { cx: 430, cy: 96, tone: "text-action-secondary", delay: "2.3s" },
];

/** The two insight cards, with drift cycles chosen so no two share a period. */
const DRIFT = {
  cohort: { duration: "13s", delay: "0s" },
  signals: { duration: "17s", delay: "1.5s" },
} as const;

/** Bar heights for the cohort card — a shape, never a figure. See the module docstring. */
const BARS: readonly number[] = [26, 38, 30, 46];

export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 480 400"
      role="presentation"
      aria-hidden="true"
      className="h-full w-full"
    >
      {/* The journey. One stroke, traced once, with `pathLength` normalised so the dash animation
          is a fraction of the line rather than a count of user units. */}
      <g className="text-brand-soft">
        <path
          d="M 44 300 C 108 300 132 258 168 232 C 216 198 252 196 300 178 C 356 157 396 136 430 96"
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          className="kayla-trace"
        />
      </g>

      {MILESTONES.map((node) => (
        <g key={`${node.cx}-${node.cy}`} className={`${node.tone} kayla-appear`} style={{ animationDelay: node.delay }}>
          <circle
            cx={node.cx}
            cy={node.cy}
            r={16}
            fill="currentColor"
            className="kayla-halo"
            style={{ animationDuration: "6s", animationDelay: node.delay }}
          />
          <circle cx={node.cx} cy={node.cy} r={7} fill="currentColor" />
          <circle cx={node.cx} cy={node.cy} r={7} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.35} />
        </g>
      ))}

      {/* Cohort completion — four bars rising, the same shape the Engagement screen draws. */}
      <g
        className="kayla-drift"
        style={{ animationDuration: DRIFT.cohort.duration, animationDelay: DRIFT.cohort.delay }}
      >
        <g className="text-surface-card">
          <rect x={30} y={40} width={186} height={112} rx={16} fill="currentColor" />
        </g>
        <g className="text-hairline-lilac">
          <rect x={30} y={40} width={186} height={112} rx={16} fill="none" stroke="currentColor" strokeWidth={1} />
        </g>
        <g className="text-surface-warm-gray">
          <rect x={50} y={60} width={64} height={7} rx={4} fill="currentColor" />
        </g>
        {BARS.map((height, index) => (
          <g key={height} className={index === BARS.length - 1 ? "text-brand-primary" : "text-brand-soft"}>
            <rect x={50 + index * 30} y={128 - height} width={16} height={height} rx={6} fill="currentColor" />
          </g>
        ))}
      </g>

      {/* Adjustment signals — three bands, never an individual's answer. */}
      <g
        className="kayla-drift"
        style={{ animationDuration: DRIFT.signals.duration, animationDelay: DRIFT.signals.delay }}
      >
        <g className="text-surface-card">
          <rect x={258} y={256} width={196} height={116} rx={16} fill="currentColor" />
        </g>
        <g className="text-hairline-lilac">
          <rect x={258} y={256} width={196} height={116} rx={16} fill="none" stroke="currentColor" strokeWidth={1} />
        </g>
        {[
          { y: 284, tone: "text-action-secondary", width: 96 },
          { y: 312, tone: "text-status-attention", width: 72 },
          { y: 340, tone: "text-action-secondary", width: 110 },
        ].map((row) => (
          <g key={row.y}>
            <g className={row.tone}>
              <circle cx={284} cy={row.y} r={6} fill="currentColor" />
            </g>
            <g className="text-surface-warm-gray">
              <rect x={300} y={row.y - 4} width={row.width} height={8} rx={4} fill="currentColor" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default HeroIllustration;
