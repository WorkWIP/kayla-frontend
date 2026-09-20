"use client";

/**
 * `/signals` — the Signals dashboard (agents.md §10.11 tasks 1-6, `kb/MVP-SPEC.md` §5.5,
 * `kb/notes/RAG.md` §7.2).
 *
 * --------------------------------------------------------------------------------------------
 * What this screen shows, and the privacy premise it must never widen
 * --------------------------------------------------------------------------------------------
 * Reads `GET /dashboard/signals` — the five scored adjustment-signal constructs
 * (`role_clarity`, `workload`, `manager_support`, `belonging`, `energy`), aggregated per cohort,
 * from `kayla.dashboard.router` (a sibling task in this same phase, `dashboard_ro`-backed, never
 * a raw table join). No worker is ever named or identifiable here — every number on this page is
 * a cohort-level aggregate or a per-org headcount, matching MVP-SPEC §5.5's own table: "No
 * individual worker's name may ever appear alongside a sentiment score... on any dashboard
 * screen." This file imports nothing from worker identity, chat, mood/free-text, Care, or crisis
 * modules, and never will — see agents.md §12.1's fitness test for why that is a static-scan
 * requirement, not a style preference.
 *
 * agents.md §10.11 task 3/5: a suppressed construct (below the org's own `min_n_threshold`,
 * §9.1 Conflict 1) carries `value: null` and `band: null` from the API. Rendering that correctly
 * — no colour class at all, but always a real status-label sentence — is `TrafficLightMeter`'s
 * job (`src/components/traffic-light-meter.tsx`, see "Shared components" below), not
 * reimplemented here.
 *
 * --------------------------------------------------------------------------------------------
 * Fixed construct order, without a second hardcoded construct list
 * --------------------------------------------------------------------------------------------
 * `kayla.checkin.constructs.ConstructId`'s own docstring is explicit that the five construct ids
 * exist in exactly ONE place in the whole system, and that "every consumer iterates this enum's
 * declaration order directly rather than re-deriving or re-sorting it." `kayla.dashboard.service`
 * (read directly before writing this file) iterates `for construct in ConstructId` when it builds
 * each cohort's `constructs` array, so `role_clarity, workload, manager_support, belonging,
 * energy` is already the order `GET /dashboard/signals` sends — this file renders `cohort.
 * constructs` exactly as received, with no client-side sort and no hardcoded id list of its own.
 * Construct labels come from `humanizeConstructId` (`checkin-question-card.tsx`, P9) for the same
 * reason: it is a pure `construct_id` -> label string transform with no per-id lookup table.
 *
 * --------------------------------------------------------------------------------------------
 * Shared components — reused, not re-implemented
 * --------------------------------------------------------------------------------------------
 * `TrafficLightMeter`/`SuppressedNotice` (`src/components/traffic-light-meter.tsx` /
 * `suppressed-notice.tsx`) were built by the concurrent Overview/Engagement task for the
 * `AdjustmentSignalDot` rows on `GET /dashboard/overview`'s adjustment-signals tile — and that
 * file's own docstring says explicitly it was "shaped to double as the per-construct row a future
 * Signals page would render from `ConstructSignal`," since both schemas carry the identical
 * `band`/`suppressed`/`status_label` triple. This page reuses it unmodified for exactly that
 * reason: neither existed on disk when this file was first drafted (a documented risk in this
 * task's own instructions), and once they landed this page was rewritten to call them rather than
 * keep its own now-redundant inline dot/status-label rendering — one fewer place in the codebase
 * that decides what a suppressed or banded row looks like.
 *
 * `TrafficLightMeter` itself renders only a label plus the dot/status-label (or `SuppressedNotice`
 * lock+label) pair — it carries no `respondent_count`/`value` slot, since Overview's dot-only tile
 * has neither. Signals is a finer grain than Overview (task 1 vs. task 7): it also shows each
 * construct's respondent headcount (never suppressed) and its 0-100 value (suppressed exactly
 * when the band is). `ConstructRow` below composes `TrafficLightMeter` with that second line
 * rather than forking the shared component to add fields Overview's tile does not need.
 *
 * --------------------------------------------------------------------------------------------
 * Fetch pattern and i18n
 * --------------------------------------------------------------------------------------------
 * A client component for the same reason `/cohorts` is one (`src/api/client.ts`'s session lives
 * in memory only; `DashboardShell` has already confirmed a session before this page mounts).
 * `GET /dashboard/signals` is already in `kayla-backend/openapi.json` as of this writing, so
 * `npm run codegen` was re-run against that file before this page was written.
 *
 * i18n: this repo has no `next-intl` install and no `messages/{en,es}.json` pair yet — see
 * `check-in-questions/page.tsx`'s own docstring, which names this gap explicitly as spanning
 * every dashboard screen, not one file's oversight. This page follows the convention that
 * actually exists on disk (plain English JSX text).
 */

import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import type { components } from "@/api/generated";
import { humanizeConstructId } from "@/components/checkin-question-card";
import { TrafficLightMeter } from "@/components/traffic-light-meter";
import type { SignalBand } from "@/components/traffic-light-meter";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AppPage } from "@/components/ui/app-page";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";

type SignalsResponse = components["schemas"]["SignalsResponse"];
type CohortSignals = components["schemas"]["CohortSignals"];
type ConstructSignal = components["schemas"]["ConstructSignal"];
type ThresholdBand = SignalBand;

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly data: SignalsResponse };

const GENERIC_FAILURE = "Could not load Signals. Try again in a moment.";
const FORBIDDEN_MESSAGE =
  "You do not have access to this page. Signals is visible to HR admins and org owners only.";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.code === CLIENT_ERROR_CODES.networkUnreachable ||
      error.code === CLIENT_ERROR_CODES.responseNotUnderstood
    ) {
      return "Kayla is not reachable right now. Try again in a moment.";
    }
    if (error.code === "forbidden") {
      return FORBIDDEN_MESSAGE;
    }
    return error.message || GENERIC_FAILURE;
  }
  return GENERIC_FAILURE;
}

const BAND_DOT_CLASS: Readonly<Record<ThresholdBand, string>> = {
  green: "bg-status-positive",
  amber: "bg-status-attention",
  red: "bg-status-critical",
};

function respondentCaption(count: number): string {
  return count === 1 ? "1 respondent" : `${count} respondents`;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * One construct's row inside a cohort card — `TrafficLightMeter` for the label/band/status-label
 * (identical treatment to Overview's adjustment-signals tile, see the module docstring), plus a
 * second line for what only Signals shows: the respondent headcount (never suppressed) and the
 * 0-100 value (suppressed exactly when the band is).
 */
function ConstructRow({ signal }: { readonly signal: ConstructSignal }) {
  const label = humanizeConstructId(signal.construct_id);
  const suppressed = signal.suppressed || signal.band === null || signal.value === null;

  return (
    <div
      data-testid={`construct-row-${signal.construct_id}`}
      data-suppressed={suppressed ? "true" : "false"}
      data-band={suppressed ? undefined : (signal.band as ThresholdBand)}
      className="flex flex-col gap-4 rounded-control border border-hairline-lilac bg-surface-card px-16 py-12"
    >
      <TrafficLightMeter
        label={label}
        band={signal.band as SignalBand | null}
        suppressed={signal.suppressed}
        statusLabel={signal.status_label}
      />
      <div className="flex items-center justify-between gap-8">
        <span className="text-meta text-text-tertiary">{respondentCaption(signal.respondent_count)}</span>
        {/* The band's colour already appeared once, on `TrafficLightMeter`'s dot above — this
         * line adds the number the meter itself doesn't carry, not a second colour cue. */}
        {!suppressed ? (
          <span className="text-label font-extrabold text-text-primary">
            {formatValue(signal.value as number)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One cohort, and the five constructs measured for it.
 *
 * The constructs used to stack, which made a cohort card roughly four hundred units tall and a
 * year of monthly cohorts an afternoon of scrolling. They are a *set* — the question is always
 * "which of these five is the one that moved" — so they sit side by side and a cohort becomes
 * one band across the page instead of a screenful.
 *
 * The order is the API's, never sorted here: `signals/page.test.tsx` pins the rendered sequence
 * to the declaration order of `ConstructId`, so that two people reading two cohorts are always
 * comparing the same column.
 */
function CohortCard({ cohort }: { readonly cohort: CohortSignals }) {
  return (
    <Card className="flex flex-col gap-12">
      <p className="text-card-title font-extrabold text-text-primary">{cohort.cohort_label}</p>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {cohort.constructs.map((signal) => (
          <ConstructRow key={signal.construct_id} signal={signal} />
        ))}
      </div>
    </Card>
  );
}

/** Task 6 / Q-46: the threshold disclosure pill — kept deliberately, not demo-only chrome. The
 * cutoffs are server text (`data.threshold_disclosure`), never re-typed here, so a future change
 * to the bands cannot drift out of step with this caption. */
function ThresholdDisclosure({ text }: { readonly text: string }) {
  const legend: ReadonlyArray<{ readonly band: ThresholdBand; readonly label: string }> = [
    { band: "green", label: "On track" },
    { band: "amber", label: "Watch" },
    { band: "red", label: "Needs attention" },
  ];

  return (
    <div className="flex flex-col gap-12 rounded-card border border-hairline-lilac bg-surface-warm-gray p-16">
      <div className="flex flex-wrap items-center justify-between gap-8">
        <p className="text-label font-bold text-text-primary">How to read these</p>
        <Badge tone="attention">Illustrative</Badge>
      </div>
      <div className="flex flex-wrap gap-x-20 gap-y-8">
        {legend.map((item) => (
          <span key={item.band} className="flex items-center gap-8 text-meta font-medium text-text-secondary">
            <span aria-hidden="true" className={`size-8 shrink-0 rounded-full ${BAND_DOT_CLASS[item.band]}`} />
            {item.label}
          </span>
        ))}
      </div>
      <p className="text-meta text-text-tertiary">{text}</p>
    </div>
  );
}

export default function SignalsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiRequest("get", "/dashboard/signals", {});
        if (!cancelled) setState({ status: "loaded", data });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: messageFor(error) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppPage
      header={
        <PageHeader
          eyebrow="Signals"
          title="Signals"
          description="Adjustment-signal constructs, aggregated per cohort. No worker is ever named or identifiable on this page — every number here is a cohort-level pattern, never an individual response."
        />
      }
      /* The legend is reference, not content: you read it once, then you read the cohorts. It
         used to sit between the heading and the first cohort, which meant scrolling past the
         key every time you came back to the page. */
      aside={
        state.status === "loaded" ? (
          <ThresholdDisclosure text={state.data.threshold_disclosure} />
        ) : undefined
      }
      asideLabel="How to read these signals"
    >
      {state.status === "loading" ? <PageSkeleton label="Loading Signals…" /> : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">Could not load Signals.</p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "loaded" ? (
        <>
          {state.data.cohorts.length === 0 ? (
            <EmptyState
              icon={<ActivityGlyph />}
              title="No cohorts yet"
              description="Signals are aggregated per cohort, so this page stays empty until a roster has formed the first one. Nothing here is ever attributed to a person."
              action={<LinkButton href="/cohorts">Upload a roster</LinkButton>}
            />
          ) : (
            <div className="flex flex-col gap-16">
              {state.data.cohorts.map((cohort) => (
                <CohortCard key={cohort.cohort_id} cohort={cohort} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </AppPage>
  );
}

/** `Icon.jsx`'s own `activity` — the same glyph the rail uses for this section. */
function ActivityGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
