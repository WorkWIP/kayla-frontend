/**
 * A single construct's traffic-light status (agents.md §10.11 tasks 3-5): a coloured dot plus its
 * text status label when the row clears the org's min-N threshold, or `SuppressedNotice` — no
 * dot, no colour at all — when it does not.
 *
 * Built for the five `AdjustmentSignalDot` rows Overview's adjustment-signals tile renders
 * (`GET /dashboard/overview`), and shaped to double as the per-construct row a future Signals
 * page would render from `ConstructSignal` (`GET /dashboard/signals` — not built by this task,
 * see `(dashboard)/page.tsx`'s own docstring) — both schemas carry the identical `band`/
 * `suppressed`/`status_label` triple, so this component needs no change to serve either; it takes
 * that triple directly rather than a specific response shape.
 *
 * --------------------------------------------------------------------------------------------
 * Where colour is allowed to mean something (and where it never is)
 * --------------------------------------------------------------------------------------------
 * The dot is the only place on this row where colour encodes a real signal, using the exact
 * `--color-status-positive` (green) / `--color-status-attention` (amber) / `--color-status-
 * critical` (red) family `@/components/ui/badge`'s own tone table already uses for its
 * positive/attention/critical tones — reused here, not re-invented, for the same three underlying
 * design tokens (agents.md R5). The status label text sits next to it always, never colour alone
 * (agents.md §5.5 / task 5) — and a suppressed row never reaches the dot branch at all: `band` is
 * `null` exactly when `suppressed` is `true` (every schema above guarantees this), so this
 * component treats "no band" as suppressed even if a future caller passes `suppressed: false` by
 * mistake, rather than trusting the boolean alone.
 */

import { SuppressedNotice } from "./suppressed-notice";

export type SignalBand = "green" | "amber" | "red";

const BAND_DOT_CLASS: Readonly<Record<SignalBand, string>> = {
  green: "bg-status-positive",
  amber: "bg-status-attention",
  red: "bg-status-critical",
};

export interface TrafficLightMeterProps {
  /** What this row is about — e.g. a humanized construct id (`humanizeConstructId`,
   * `checkin-question-card.tsx`). This component renders whatever label it is given; it carries
   * no construct list of its own. */
  readonly label: string;
  /** `null` exactly when `suppressed` is true — never a real band with no label, and never
   * rendered even if `suppressed` were somehow false alongside it (see the module docstring). */
  readonly band: SignalBand | null;
  readonly suppressed: boolean;
  /** Always present, suppressed or not — the server's own copy, rendered verbatim. */
  readonly statusLabel: string;
}

export function TrafficLightMeter({ label, band, suppressed, statusLabel }: TrafficLightMeterProps) {
  return (
    /*
      `flex-wrap`, and the label no longer truncates.

      This row is laid out side by side — name on the left, status on the right — which is right
      until the status is a *sentence*. A suppressed construct's status copy is server-authored
      and long ("Not enough responses yet to report this"), and in a narrow column it squeezed
      the name down to "Manag…". A truncated construct name is the one thing on this row that
      must never be ambiguous: "Manager support" and "Manager…" are not obviously the same
      construct to someone scanning five of them.

      Wrapping puts the status on its own line when the two cannot share one, and the name keeps
      its full width either way. Nothing moves in the common case, where the status is two words.
    */
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <span className="min-w-[0] text-copy text-text-primary">{label}</span>
      {/* Inlined (not a precomputed boolean) so TypeScript narrows `band` to `SignalBand` in the
          branch below — the whole point of `band: SignalBand | null` in the first place. */}
      {suppressed || band === null ? (
        <SuppressedNotice statusLabel={statusLabel} />
      ) : (
        <span className="flex shrink-0 items-center gap-8">
          <span
            aria-hidden="true"
            className={`size-8 shrink-0 rounded-full ${BAND_DOT_CLASS[band]}`}
          />
          <span className="text-meta font-bold text-text-secondary">{statusLabel}</span>
        </span>
      )}
    </div>
  );
}

export default TrafficLightMeter;
