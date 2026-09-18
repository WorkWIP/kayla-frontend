"use client";

/**
 * `/cohorts` — the cohort list (agents.md §10.3 task 7, `kb/MVP-SPEC.md` §3.4).
 *
 * Reads `GET /cohorts`, which any signed-in dashboard role may call — roster data carries no
 * signal (PRD §7: "Rosters may list names. Signals may not attach to them."). Each row renders
 * as a `CohortCard` linking to `/cohorts/[id]`.
 *
 * A client component because the session this dashboard runs on lives only in
 * `src/api/client.ts`'s in-memory store (never `localStorage`, agents.md §6.2/`client.ts`'s own
 * `SESSION` docstring) — there is nothing a server render could fetch with. `DashboardShell`
 * (this route's layout) has already confirmed a session exists before this page ever mounts, so
 * this file's only job is to fetch and render, not to guard authentication a second time.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import type { components } from "@/api/generated";
import { CohortCard } from "@/components/cohort-card";

type CohortSummary = components["schemas"]["CohortSummary"];

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly cohorts: readonly CohortSummary[] };

const GENERIC_FAILURE = "Could not load cohorts. Try again in a moment.";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.code === CLIENT_ERROR_CODES.networkUnreachable ||
      error.code === CLIENT_ERROR_CODES.responseNotUnderstood
    ) {
      return "Kayla is not reachable right now. Try again in a moment.";
    }
    return error.message || GENERIC_FAILURE;
  }
  return GENERIC_FAILURE;
}

export default function CohortsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const cohorts = await apiRequest("get", "/cohorts", {});
        if (!cancelled) setState({ status: "loaded", cohorts });
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
      <div className="flex flex-wrap items-start justify-between gap-16">
        <div className="flex flex-col gap-8">
          <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
            Cohorts
          </p>
          <h1 className="text-display-2 text-text-primary">Cohorts</h1>
          <p className="max-w-md text-body text-text-secondary">
            Grouped by the calendar month each worker started. A roster row with no start date is
            pooled into one cohort until the file is corrected.
          </p>
        </div>
        <Link
          href="/cohorts/upload"
          className="flex min-h-48 shrink-0 items-center rounded-control bg-action-primary px-24 text-label font-bold text-text-inverse transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-action-primary-hover focus-visible:outline-hidden focus-visible:inset-shadow-focus-mint"
        >
          Upload roster
        </Link>
      </div>

      {state.status === "loading" ? (
        <p role="status" className="text-body text-text-secondary">
          Loading cohorts…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">Could not load cohorts.</p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "loaded" && state.cohorts.length === 0 ? (
        <p className="text-body text-text-secondary">
          No cohorts yet. Upload a roster to form the first one.
        </p>
      ) : null}

      {state.status === "loaded" && state.cohorts.length > 0 ? (
        <div className="grid grid-cols-1 gap-16 sm:grid-cols-2 lg:grid-cols-3">
          {state.cohorts.map((cohort) => (
            <CohortCard
              key={cohort.id}
              id={cohort.id}
              label={cohort.label}
              rosterEntryCount={cohort.roster_entry_count}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
