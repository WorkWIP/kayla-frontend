/**
 * The tile "chrome" shared by every Overview KPI (agents.md §10.11 task 7, `GET /dashboard/
 * overview`): a bordered card with an eyebrow label and whatever content the caller passes as
 * `children`.
 *
 * `children`, not a `value`/`secondary`/`lockLabel` prop triple the way the demo's own
 * `OverviewKpiTile.tsx` takes them: this tile shell has to hold a plain stat (`KpiStat` below), a
 * `SuppressedNotice`, *or* a list of `TrafficLightMeter` rows for the adjustment-signals tile —
 * three genuinely different shapes `GET /dashboard/overview`'s four tile fields return, not one
 * shape with a couple of optional fields. `children` is the one API that fits all three without
 * the tile needing to know which kind of content it is holding.
 *
 * Visually ported from the demo's card + `Link`-wrapped-card contract (a plain card, or one with
 * hover/focus affordances when `href` is given) but rebuilt against this repo's generated tokens
 * rather than the demo's own `--primary-*`/`--surface-border` variables, matching the exact card
 * treatment `cohort-card.tsx` already established (`rounded-card`, `border-hairline-lilac`,
 * `shadow-elevation-card`, the same hover/focus classes) so every card on this dashboard reads as
 * one system rather than two.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { CARD_SURFACE } from "@/components/ui/card";

export interface KpiTileProps {
  readonly label: string;
  /** Present -> the tile is a real link with hover/focus affordances. Absent -> a plain, static
   * card. `(dashboard)/page.tsx` never gives the "On track" tile one — there is no drill-down an
   * aggregate-only page can offer (agents.md §5.6 / R3). */
  readonly href?: string;
  readonly children: ReactNode;
}

/** The shared card treatment plus this tile's own stacking — see `@/components/ui/card`. */
const BASE_CLASS = `flex flex-col gap-8 ${CARD_SURFACE}`;
const INTERACTIVE_CLASS =
  "transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-plum-tint focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum";

export function KpiTile({ label, href, children }: KpiTileProps) {
  const body = (
    <>
      <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
        {label}
      </p>
      {children}
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} className={`${BASE_CLASS} ${INTERACTIVE_CLASS}`}>
        {body}
      </Link>
    );
  }

  return <div className={BASE_CLASS}>{body}</div>;
}

export type KpiStatEmphasis = "stat" | "compact";

export interface KpiStatProps {
  /** Preformatted for display — this component does no rounding or unit conversion of its own;
   * see `(dashboard)/page.tsx`'s own `formatPercent`/`formatHeadcount` for that. */
  readonly value: string;
  /** agents.md §5.5: a number is always contextualised — a caption, never a bare figure. Optional
   * only for the one case with nothing sensible to add (`percent_signed_up` with zero enrolled —
   * see the call site). */
  readonly caption?: string;
  /**
   * How big the figure is set.
   *
   * `stat` (44/800) is the design system's dashboard-stat step and the right answer for a bare
   * number: "175", "92%". `compact` (28/700) is for a figure that carries its unit inside it —
   * "208 min/week" — which is a different typographic object and does not fit the same box. At
   * 44 it overran its tile in a six-across strip; at 28 it sits on one line beside neighbours
   * that are still set at 44, which reads as emphasis rather than error.
   *
   * Deliberately a prop rather than a length check on `value`: a rule like "shrink past nine
   * characters" would silently reformat a genuinely large headcount, and the thing that actually
   * differs here is not the length but whether the unit is part of the number.
   */
  readonly emphasis?: KpiStatEmphasis;
}

const STAT_CLASS: Readonly<Record<KpiStatEmphasis, string>> = {
  stat: "text-stat font-extrabold",
  compact: "text-display-2",
};

/** The plain-number half of a `KpiTile`'s body — `enrolled_headcount`, `percent_signed_up`, and
 * the non-suppressed branch of `checkin_completion`/`on_track` all render one of these. */
export function KpiStat({ value, caption, emphasis = "stat" }: KpiStatProps) {
  return (
    <div className="flex min-w-[0] flex-col gap-4">
      <p className={`min-w-[0] text-text-primary ${STAT_CLASS[emphasis]}`}>{value}</p>
      {caption !== undefined ? <p className="text-meta text-text-secondary">{caption}</p> : null}
    </div>
  );
}

export default KpiTile;
