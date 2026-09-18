/**
 * One cohort as a card on `/cohorts` (agents.md §10.3 task 7, `kb/MVP-SPEC.md` §3.4).
 *
 * A cohort is "the calendar month a worker started work" (`Q-41`), or, for rows with no start
 * date, the org's single pooled cohort — `GET /cohorts` already resolves both into one
 * `CohortSummary` (`label`, `start_month`, `roster_entry_count`), so this component has no
 * branching of its own: it renders whatever label and count the API sends and links to the
 * matching detail page.
 *
 * Deliberately thin: no status pill, no trend, no average day. Those belonged to the demo's
 * `CohortsScreen.tsx` (`cohort.status` / `cohort.trendPP` / `cohort.avgDay`, from
 * `lib/mock/cohorts.ts`), which is engagement data with no counterpart in this phase's
 * contract. Rendering it here would be inventing a column the API does not return — the same
 * mistake the cohort-detail table is explicitly warned against (agents.md §10.3 task 7).
 */

import Link from "next/link";

export interface CohortCardProps {
  readonly id: string;
  readonly label: string;
  readonly rosterEntryCount: number;
}

export function CohortCard({ id, label, rosterEntryCount }: CohortCardProps) {
  const countCaption =
    rosterEntryCount === 1 ? "1 roster entry" : `${rosterEntryCount} roster entries`;

  return (
    <Link
      href={`/cohorts/${id}`}
      className="flex min-h-64 flex-col gap-8 rounded-card border border-hairline-lilac bg-surface-card p-24 text-left shadow-elevation-card transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-plum-tint focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum"
    >
      <span className="text-card-title font-extrabold text-text-primary">{label}</span>
      {/* agents.md §5.5: a number is always contextualised — a caption, never a bare figure. */}
      <span className="text-meta font-medium text-text-secondary">{countCaption}</span>
    </Link>
  );
}

export default CohortCard;
