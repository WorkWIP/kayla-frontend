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
 *
 * --------------------------------------------------------------------------------------------
 * Layout
 * --------------------------------------------------------------------------------------------
 * `AppPage` supplies the frame — the same frame, at the same width, as every other screen. The
 * grid keeps going past `lg`: three columns was the old cap because the page itself stopped at
 * roughly a thousand units, and a cohort card is two short lines, so six across on a wide
 * display is dense rather than cramped.
 *
 * The search box is the one real addition. "Ensure capability to search for a record with a
 * variety of keywords" is the first recommendation in koruux's survey of patient look-up lists,
 * and an organisation with two years of monthly cohorts has two dozen of them with nothing but
 * the eye to find one. It filters in memory: `GET /cohorts` returns the whole list unpaged, so
 * there is nothing to ask the server for.
 */

import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import type { components } from "@/api/generated";
import { CohortCard } from "@/components/cohort-card";
import { AppPage } from "@/components/ui/app-page";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { PageSkeleton } from "@/components/ui/skeleton";

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

/** Case-insensitive substring match on the one field a cohort has to be found by. */
function matchesQuery(cohort: CohortSummary, query: string): boolean {
  return cohort.label.toLowerCase().includes(query.trim().toLowerCase());
}

export default function CohortsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");

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

  const cohorts = state.status === "loaded" ? state.cohorts : [];
  const visible = cohorts.filter((cohort) => matchesQuery(cohort, query));
  // The search box only earns its place once there is enough to search. On an empty org it would
  // be a control that filters nothing, sitting above the message explaining there is nothing yet.
  const searchable = state.status === "loaded" && cohorts.length > 0;

  return (
    <AppPage
      header={
        <PageHeader
          eyebrow="Cohorts"
          title="Cohorts"
          description="Grouped by the calendar month each worker started. A roster row with no start date is pooled into one cohort until the file is corrected."
          actions={<LinkButton href="/cohorts/upload">Upload roster</LinkButton>}
        />
      }
      toolbar={
        searchable ? (
          <SearchField
            label="Search cohorts by name"
            placeholder="Search cohorts…"
            value={query}
            onValueChange={setQuery}
          />
        ) : undefined
      }
    >
      {state.status === "loading" ? <PageSkeleton label="Loading cohorts…" shape="grid" /> : null}

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
        <EmptyState
          icon={<UsersGlyph />}
          title="No cohorts yet"
          description="Upload a roster of your new hires and Kayla forms the first cohort from it, grouped by the month each person started."
          action={<LinkButton href="/cohorts/upload">Upload your first roster</LinkButton>}
        />
      ) : null}

      {/* Found nothing is not the same as have nothing, and saying "No cohorts yet" to someone
          who has thirty of them and a typo in the box would be a lie. */}
      {searchable && visible.length === 0 ? (
        <EmptyState
          icon={<UsersGlyph />}
          title="No cohort matches that search"
          description="Cohorts are named for the month their workers started — try a month, or a year."
        />
      ) : null}

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-16 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {visible.map((cohort) => (
            <CohortCard
              key={cohort.id}
              id={cohort.id}
              label={cohort.label}
              rosterEntryCount={cohort.roster_entry_count}
            />
          ))}
        </div>
      ) : null}
    </AppPage>
  );
}

/**
 * Lucide `users` — the same glyph the rail uses for this section, so the empty state and the nav
 * item a person just clicked are visibly the same place.
 */
function UsersGlyph() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
