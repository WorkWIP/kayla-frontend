"use client";

/**
 * `/engagement` — the 90-day milestone check-in completion trend (agents.md §10.11 task 8, `Q-35`:
 * "keep").
 *
 * Reads `GET /dashboard/engagement` (`kayla.dashboard.router`, HR admin / org owner only) and
 * renders the org's current cohort trend alongside a comparison line, via
 * `EngagementTrendChart` (`src/components/engagement-trend-chart.tsx` — that file's own docstring
 * covers the real/illustrative comparison split and the suppressed-point handling). A client
 * component for the same reason `/cohorts`, `/check-in-questions` and `(dashboard)/page.tsx` are.
 *
 * `current_cohort_id: null` — the org has no cohort with any milestone check-in due yet — is a
 * real, distinct empty state, not a load failure, and is rendered as its own message rather than
 * the error alert.
 */

import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import type { components } from "@/api/generated";
import { EngagementTrendChart } from "@/components/engagement-trend-chart";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";

type EngagementResponse = components["schemas"]["EngagementResponse"];

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly engagement: EngagementResponse };

const GENERIC_FAILURE = "Could not load engagement. Try again in a moment.";
const FORBIDDEN_MESSAGE =
  "You do not have access to this page. Engagement is visible to HR admins and org owners only.";

/** Fallback legend/column text when the server sends no cohort label to pair with a mode — e.g.
 * `no_comparison_data` names no cohort at all, by definition. */
const COMPARISON_MODE_LABEL: Readonly<Record<EngagementResponse["comparison_mode"], string>> = {
  real_previous_cohort: "Previous cohort",
  illustrative_previous_cohort: "Illustrative previous cohort",
  no_comparison_data: "No comparison yet",
};

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

export default function EngagementPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const engagement = await apiRequest("get", "/dashboard/engagement", {});
        if (!cancelled) setState({ status: "loaded", engagement });
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-24 p-32">
      <PageHeader
        eyebrow="Engagement"
        title="Engagement"
        description="Milestone check-in completion for the organization’s current cohort, days 7 through 90."
      />

      {state.status === "loading" ? (
        <PageSkeleton label="Loading engagement…" shape="form" count={4} />
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">Could not load engagement.</p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "loaded" && state.engagement.current_cohort_id === null ? (
        <EmptyState
          title="No cohort has a milestone check-in due yet"
          description="This page fills in on its own once the first cohort reaches day 7. If you have not uploaded a roster, that is the step that starts the clock."
          action={<LinkButton href="/cohorts/upload">Upload a roster</LinkButton>}
        />
      ) : null}

      {state.status === "loaded" && state.engagement.current_cohort_id !== null ? (
        <EngagementTrend engagement={state.engagement} />
      ) : null}
    </div>
  );
}

function EngagementTrend({ engagement }: { readonly engagement: EngagementResponse }) {
  const currentLabel = engagement.current_cohort_label ?? "Current cohort";
  const comparisonLabel =
    engagement.comparison_cohort_label ?? COMPARISON_MODE_LABEL[engagement.comparison_mode];

  return (
    <Card className="flex flex-col gap-16">
      <h2 className="text-title font-bold text-text-primary">{currentLabel}</h2>
      <EngagementTrendChart
        currentTrend={engagement.current_trend}
        currentLabel={currentLabel}
        comparisonMode={engagement.comparison_mode}
        comparisonTrend={engagement.comparison_trend}
        comparisonLabel={comparisonLabel}
      />
      {engagement.comparison_disclaimer !== null ? (
        <p className="text-meta text-text-tertiary">{engagement.comparison_disclaimer}</p>
      ) : null}
    </Card>
  );
}
