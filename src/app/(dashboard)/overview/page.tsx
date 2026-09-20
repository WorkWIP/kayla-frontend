"use client";

/**
 * `/overview` — Overview, the HR dashboard's landing page (agents.md §10.11 tasks 1-3, 5, 7).
 *
 * Reads `GET /dashboard/overview` (`kayla.dashboard.router`, HR admin / org owner only — the same
 * `require_role` pair every route in that module declares) and renders the tile grid the real
 * `OverviewResponse` contract carries: `enrolled_headcount`, `percent_signed_up` (with
 * `signed_up_headcount`), `active_usage`, `checkin_completion`, `on_track`, `adjustment_signals`
 * and `time_saved_minutes_per_week`. A client component for the same reason `/cohorts` and
 * `/check-in-questions` are — the session lives only in `src/api/client.ts`'s in-memory store, and
 * `DashboardShell` (this route group's layout) has already confirmed one exists before this page
 * mounts.
 *
 * --------------------------------------------------------------------------------------------
 * This page used to own "/". It does not any more.
 * --------------------------------------------------------------------------------------------
 * `/` is being freed for a public marketing landing page, built by a later task. Nothing lives
 * at `/` in the meantime — deliberately, rather than a redirect that would have to be unpicked.
 * Everything that pointed here moved with it in the same change: `NAV_ITEMS[0].href` in
 * `sidebar-nav.tsx`, `POST_LOGIN_DESTINATION` in `login-form.tsx`, the route registry in
 * `(dashboard)/__tests__/no-individual-care-usage.test.tsx`, and `login/page.test.tsx`'s
 * destination assertion.
 *
 * A signed-out visitor loses nothing: `DashboardShell` redirects to `/login` the instant
 * `useAuthenticatedSession` finds no session, rendering nothing in between.
 *
 * --------------------------------------------------------------------------------------------
 * The getting-started checklist
 * --------------------------------------------------------------------------------------------
 * A freshly self-signed-up organisation has no roster, no handbook and nobody signed up, so every
 * tile below is legitimately zero and the screen reads as broken rather than new. The checklist
 * above the grid answers "what do I do first" with three steps, each reflecting real state read
 * from a real endpoint — never a local flag a person can tick off without doing the thing:
 *
 *   1. Upload your roster    -> `GET /cohorts` returns at least one cohort
 *   2. Upload your handbook  -> `GET /kb/documents` returns at least one document
 *   3. Invite your team      -> `signed_up_headcount > 0` on the overview already in hand
 *
 * It retires itself the moment all three are true — an onboarding checklist that never goes away
 * is a permanent accusation.
 *
 * It sits in the page's context panel rather than above the numbers. It used to push the whole
 * dashboard down a screen on exactly the orgs whose figures most needed explaining, and "what to
 * do next" is the definition of supplementary: useful beside the numbers, not in front of them.
 *
 * The two extra reads are fired only after the overview itself loads, and only for their length:
 * an unparseable or failed response is treated as "not done yet", never as an error worth
 * interrupting the page for. This screen's job is the aggregates; the checklist is advice.
 *
 * --------------------------------------------------------------------------------------------
 * No "Recommended next action" tile
 * --------------------------------------------------------------------------------------------
 * The demo's `OverviewScreen.tsx` ends on a card reading `data.nextActionVariantKey` out of mock
 * data. The real `OverviewResponse` carries no field for it at all — no next-action text, no
 * variant key, nothing this page could render without inventing product copy the API never sent.
 * Dropped entirely rather than shipped with placeholder copy.
 *
 * --------------------------------------------------------------------------------------------
 * The adjustment-signals tile links to `/signals`
 * --------------------------------------------------------------------------------------------
 * Matching the demo's equivalent tile. No query string is passed: `GET /dashboard/overview`
 * carries no site/period scope for `/signals` to inherit, unlike the demo's own scoped variant.
 */

import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import type { components } from "@/api/generated";
import { humanizeConstructId } from "@/components/checkin-question-card";
import { KpiStat, KpiTile } from "@/components/kpi-tile";
import { SuppressedNotice } from "@/components/suppressed-notice";
import { TrafficLightMeter } from "@/components/traffic-light-meter";
import { AppPage } from "@/components/ui/app-page";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";

type OverviewResponse = components["schemas"]["OverviewResponse"];

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly overview: OverviewResponse };

const GENERIC_FAILURE = "Could not load the overview. Try again in a moment.";
const FORBIDDEN_MESSAGE =
  "You do not have access to this page. The dashboard overview is visible to HR admins and org owners only.";

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

/** Rounded to the nearest whole percent — every fraction this page shows (`rate`,
 * `percent_signed_up`) is a display figure, not an input to anything else on the page. */
function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function formatHeadcount(count: number): string {
  return count.toLocaleString("en-US");
}

export default function OverviewPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const overview = await apiRequest("get", "/dashboard/overview", {});
        if (!cancelled) setState({ status: "loaded", overview });
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
          eyebrow="Overview"
          title="Overview"
          description="Org-wide participation and adjustment signals. Every number below is an aggregate — no individual worker’s answers, mood, or Kayla use ever appears here."
        />
      }
      aside={
        state.status === "loaded" ? (
          <GettingStartedChecklist overview={state.overview} />
        ) : undefined
      }
      asideLabel="Getting started"
    >
      {state.status === "loading" ? (
        <PageSkeleton label="Loading the overview…" shape="grid" count={6} />
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">Could not load the overview.</p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "loaded" ? <OverviewTiles overview={state.overview} /> : null}
    </AppPage>
  );
}

// ====================================================================================================
// Getting started
// ====================================================================================================

interface ChecklistStep {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly done: boolean;
  readonly href: string;
  readonly action: string;
}

type ProbeState =
  | { readonly status: "probing" }
  | { readonly status: "settled"; readonly hasRoster: boolean; readonly hasHandbook: boolean };

/**
 * Length only, never content. A response this client cannot read as a list is "nothing yet",
 * which is also what a 403 or a dead network means for the purposes of "have you done this
 * step" — and none of the three is worth an error banner on a page whose real job loaded fine.
 */
async function probeCount(load: () => Promise<unknown>): Promise<boolean> {
  try {
    const body = await load();
    if (Array.isArray(body)) return body.length > 0;
    if (typeof body === "object" && body !== null) {
      const { documents } = body as { documents?: unknown };
      if (Array.isArray(documents)) return documents.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

function GettingStartedChecklist({ overview }: { readonly overview: OverviewResponse }) {
  const [probe, setProbe] = useState<ProbeState>({ status: "probing" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const [hasRoster, hasHandbook] = await Promise.all([
        probeCount(() => apiRequest("get", "/cohorts", {})),
        probeCount(() => apiRequest("get", "/kb/documents", {})),
      ]);
      if (!cancelled) setProbe({ status: "settled", hasRoster, hasHandbook });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (probe.status === "probing") {
    // No `role="status"` here on purpose: the page already has exactly one, and a second live
    // region competing with it is how a screen reader ends up announcing neither.
    return <Skeleton className="h-64 w-full rounded-card" />;
  }

  const steps: readonly ChecklistStep[] = [
    {
      key: "roster",
      title: "Upload your roster",
      body: "A CSV of your new hires. Kayla groups them into cohorts by start month, and everything else on this page follows from it.",
      done: probe.hasRoster,
      href: "/cohorts/upload",
      action: "Upload roster",
    },
    {
      key: "handbook",
      title: "Upload your handbook",
      body: "Your policy documents, so Kayla can answer a new hire’s questions from them — with a citation back to the exact section, every time.",
      done: probe.hasHandbook,
      href: "/knowledge-base/upload",
      action: "Upload handbook",
    },
    {
      key: "invite",
      title: "Invite your team",
      body: "Kayla emails everyone on the roster a sign-in link. This step completes itself the moment the first person accepts.",
      done: overview.signed_up_headcount > 0,
      href: "/cohorts",
      action: "Review the roster",
    },
  ];

  const remaining = steps.filter((step) => !step.done);
  // Done is done. A checklist that stays on the page after every box is ticked stops being a
  // checklist and starts being decoration.
  if (remaining.length === 0) return null;

  const nextStep = remaining[0];

  return (
    <section
      aria-labelledby="getting-started-heading"
      className="flex flex-col gap-16 rounded-card border border-hairline-lilac bg-surface-plum-tint p-24 shadow-elevation-card"
    >
      <div className="flex flex-col gap-4">
        <h2 id="getting-started-heading" className="text-card-title font-extrabold text-text-primary">
          Get set up
        </h2>
        <p className="text-copy text-text-secondary">
          {`${steps.length - remaining.length} of ${steps.length} done. This disappears once you finish.`}
        </p>
      </div>

      <ol className="flex list-none flex-col gap-12 p-[0]">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="flex flex-col gap-8 rounded-control bg-surface-card p-16 sm:flex-row sm:items-center sm:justify-between sm:gap-16"
          >
            <div className="flex items-start gap-12">
              <span
                aria-hidden="true"
                className={[
                  "flex size-24 shrink-0 items-center justify-center rounded-full text-micro font-extrabold",
                  step.done
                    ? "bg-status-positive-subtle text-status-positive"
                    : "bg-surface-warm-gray text-text-secondary",
                ].join(" ")}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div className="flex min-w-[0] flex-col gap-4">
                <p className="text-label font-bold text-text-primary">
                  {step.title}
                  <span className="sr-only">{step.done ? " — done" : " — not done yet"}</span>
                </p>
                <p className="text-meta text-text-secondary">{step.body}</p>
              </div>
            </div>
            {step.done ? null : (
              <LinkButton
                href={step.href}
                size="sm"
                variant={step.key === nextStep?.key ? "primary" : "secondary"}
                className="shrink-0"
              >
                {step.action}
              </LinkButton>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ====================================================================================================
// The tile grid
// ====================================================================================================

function OverviewTiles({ overview }: { readonly overview: OverviewResponse }) {
  const signedUpCaption =
    overview.enrolled_headcount === 0
      ? "No one enrolled yet"
      : `${formatHeadcount(overview.signed_up_headcount)} of ${formatHeadcount(overview.enrolled_headcount)} signed up`;

  return (
    <div className="flex flex-col gap-16">
      {/*
        The adoption funnel and its two outcome rates, as one strip — six across on a wide
        display rather than three. These are single figures with a caption, they exist to be
        compared with one another, and a comparison you have to scroll between is not one.
      */}
      <div className="grid grid-cols-1 gap-16 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiTile label="New hires enrolled" href="/cohorts">
          <KpiStat value={formatHeadcount(overview.enrolled_headcount)} caption="Every roster row for this org" />
        </KpiTile>

        <KpiTile label="Signed up">
          <KpiStat
            value={overview.percent_signed_up === null ? "—" : formatPercent(overview.percent_signed_up)}
            caption={signedUpCaption}
          />
        </KpiTile>

        {/* The adoption funnel's third leg — enrolled -> signed up -> active. The headcount is
            never suppressed; the rate is, which is why the two are read separately. */}
        <KpiTile label="Active">
          {overview.active_usage.suppressed ? (
            <SuppressedNotice statusLabel={overview.active_usage.status_label} />
          ) : (
            <KpiStat
              value={
                overview.active_usage.rate === null ? "—" : formatPercent(overview.active_usage.rate)
              }
              caption={`${formatHeadcount(overview.active_usage.active_headcount)} used Kayla in the last ${formatHeadcount(overview.active_usage.window_days)} days`}
            />
          )}
        </KpiTile>

        <KpiTile label="Check-in completion">
          {overview.checkin_completion.suppressed ? (
            <SuppressedNotice statusLabel={overview.checkin_completion.status_label} />
          ) : (
            <KpiStat
              value={
                overview.checkin_completion.rate === null
                  ? "—"
                  : formatPercent(overview.checkin_completion.rate)
              }
              caption={`${formatHeadcount(overview.checkin_completion.completed_checkins)} of ${formatHeadcount(overview.checkin_completion.required_checkins)} check-ins completed`}
            />
          )}
        </KpiTile>

        {/* Never a link — there is no drill-down this aggregate can offer (agents.md §5.6 / R3). */}
        <KpiTile label="On track">
          {overview.on_track.suppressed ? (
            <SuppressedNotice statusLabel={overview.on_track.status_label} />
          ) : (
            <KpiStat
              value={overview.on_track.rate === null ? "—" : formatPercent(overview.on_track.rate)}
              caption={`${formatHeadcount(overview.on_track.population_headcount)} signed-up workers with a start date`}
            />
          )}
        </KpiTile>

        <KpiTile label="Time saved">
          {/* The one figure on this strip that carries its unit inside the value rather than in
              the caption — see `KpiStat`'s `emphasis` for why that needs a smaller step. */}
          <KpiStat
            emphasis="compact"
            value={`${formatHeadcount(overview.time_saved_minutes_per_week)} min/week`}
            caption={`Estimated across ${formatHeadcount(overview.enrolled_headcount)} enrolled new hires`}
          />
        </KpiTile>
      </div>

      {/*
        The signals panel, on its own row and the full width of the page.

        It was the sixth cell of a three-column grid: five construct meters stacked inside a tile
        sized for a single number — the tallest thing on the screen, and the one that most has to
        be read as a set. Given the whole width the five sit side by side, which is how a person
        notices that one of them is amber.

        Still one link to `/signals`, still labelled "Adjustment signals". The tile shell is
        unchanged; only the room it has been given.
      */}
      <KpiTile label="Adjustment signals" href="/signals">
        <ul
          aria-label="Adjustment signals by construct"
          className="grid list-none grid-cols-1 gap-12 p-[0] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
        >
          {overview.adjustment_signals.constructs.map((construct) => (
            <li
              key={construct.construct_id}
              className="rounded-control bg-surface-warm-gray px-16 py-12"
            >
              <TrafficLightMeter
                label={humanizeConstructId(construct.construct_id)}
                band={construct.band}
                suppressed={construct.suppressed}
                statusLabel={construct.status_label}
              />
            </li>
          ))}
        </ul>
      </KpiTile>
    </div>
  );
}
