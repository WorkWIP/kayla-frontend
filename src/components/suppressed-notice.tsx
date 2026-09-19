/**
 * The one rendering for a suppressed metric anywhere on the dashboard (agents.md §10.11 tasks 3
 * and 5, `kb/MVP-SPEC.md` §5.5): "A suppressed row shows no traffic-light colour at all — colour
 * would itself leak directional information about a too-small cohort," and "colour is never the
 * only signal," so every suppressed value still carries a text/icon label.
 *
 * --------------------------------------------------------------------------------------------
 * Why this is plain text, not a coloured pill — even a neutral-grey one
 * --------------------------------------------------------------------------------------------
 * `kb-document-card.tsx`'s `StatusBadge` renders a KB document's status as a filled pill (its own
 * `Badge` tone table, one of which is a neutral `bg-surface-warm-gray` tone). That is the right
 * shape for "this is one of several statuses" — it is the wrong shape here: a filled pill, even a
 * grey one, still reads as "a status indicator" sitting next to `TrafficLightMeter`'s green/amber/
 * red dot for every *other* row on the same tile, which invites exactly the "which colour is
 * this?" reading task 3 exists to prevent. So a suppressed value renders as ordinary inline text —
 * a lock glyph (decorative, `aria-hidden`; the label text is what assistive tech reads) plus the
 * server's own `status_label`, in the same neutral caption colour (`text-text-secondary`) every
 * other caption on this dashboard already uses (see `cohort-card.tsx`'s roster-count caption) —
 * never a `bg-status-*` / `text-status-*` / `border-status-*` class, which is the actual band
 * palette this file must never reach for.
 *
 * `KpiTile` and `TrafficLightMeter` both render this exact component whenever their `suppressed`
 * prop is true, so there is exactly one place in the codebase that decides what "suppressed"
 * looks like — see each file's own docstring.
 *
 * `statusLabel` is always the API's own string (`ConstructSignal.status_label`,
 * `CheckinCompletionTile.status_label`, `OnTrackTile.status_label`, `MilestoneTrendPoint.
 * status_label`, `AdjustmentSignalDot.status_label` — `kayla-backend/src/kayla/dashboard/
 * schemas.py`). This component never writes suppression copy of its own, so the exact sentence
 * always matches whatever `kayla.dashboard.service` decided, including its exact per-org min-N
 * wording.
 */

export interface SuppressedNoticeProps {
  readonly statusLabel: string;
}

export function SuppressedNotice({ statusLabel }: SuppressedNoticeProps) {
  return (
    <p className="flex items-center gap-4 text-meta font-medium text-text-secondary">
      <span aria-hidden="true">🔒</span>
      <span>{statusLabel}</span>
    </p>
  );
}

export default SuppressedNotice;
