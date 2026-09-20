"use client";

/**
 * `/cohorts/[id]` — one cohort's roster entries (agents.md §10.3 task 7, `kb/MVP-SPEC.md` §3.4).
 *
 * The table shows exactly what `GET /cohorts/{cohort_id}` returns for each entry: last name,
 * first name, email, start date, site and job title. Nothing else — no mood, no signal, no
 * check-in status. Those are later phases, and PRD §7 is explicit that a roster screen must
 * never grow one; this phase's fitness test (agents.md §12.2) is that `kayla.roster` never even
 * imports the modules that data would come from, so there is nothing here for this screen to
 * reach for even if it wanted to.
 *
 * --------------------------------------------------------------------------------------------
 * Why this file does not call `apiRequest` from `src/api/client.ts`
 * --------------------------------------------------------------------------------------------
 * `apiRequest`'s `path` parameter has to literally be one of the string keys of the generated
 * `paths` type — every other dashboard route so far (`/auth/login`, `/cohorts`) takes no path
 * parameter, so that has never been a problem before this screen. `GET /cohorts/{cohort_id}`
 * needs a real id substituted into the path at request time, and the wrapper has no seam for
 * that. Casting a real id through the literal type (`` `/cohorts/${id}` as "/cohorts/{cohort_id}" ``)
 * would compile but reads as a lie at the call site about what `path` actually is. Instead this
 * file makes the one request itself, reusing the same contract types (`components["schemas"]`),
 * the same in-memory session store (`getSession`), and the same `ApiError` shape `apiRequest`
 * raises everywhere else, so a caller downstream still has exactly one error type to branch on.
 * `src/api/client.ts` is outside this task's file ownership; giving `apiRequest` a real path-
 * parameter seam belongs to whoever owns that file next (reported in this phase's notes).
 */

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, getSession } from "@/api/client";
import type { components } from "@/api/generated";
import { AppPage } from "@/components/ui/app-page";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Table, TableCell, TableEmptyRow, TableRow } from "@/components/ui/table";
import { env } from "@/env";

type CohortDetailResponse = components["schemas"]["CohortDetailResponse"];
/** One row of the roster — named here rather than re-spelled at each use below. */
type RosterEntry = CohortDetailResponse["entries"][number];
type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];

const API_ROOT = env.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}

/** Mirrors `apiRequest`'s own error handling exactly (see the file docstring for why it is
 * duplicated here rather than imported). */
async function fetchCohortDetail(cohortId: string): Promise<CohortDetailResponse> {
  const session = getSession();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (session !== null) {
    headers.Authorization = `Bearer ${session.tokens.access_token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/cohorts/${encodeURIComponent(cohortId)}`, {
      method: "GET",
      headers,
      credentials: "omit",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.networkUnreachable,
      message: "Could not reach the Kayla API.",
      details: { cause: cause instanceof Error ? cause.name : "unknown" },
    });
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (isErrorEnvelope(body)) {
      throw new ApiError({
        status: response.status,
        code: body.error.code,
        message: body.error.message,
        details: body.error.details,
      });
    }
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.responseNotUnderstood,
      message: `The server responded with ${response.status} and a body this client does not understand.`,
    });
  }

  try {
    return (await response.json()) as CohortDetailResponse;
  } catch {
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.responseNotUnderstood,
      message: "The server responded with a body this client does not understand.",
    });
  }
}

/**
 * The roster's own columns, in order. `cohorts/[id]/page.test.tsx` asserts this exact list comes
 * back from `getAllByRole("columnheader")`. It stops at what a roster file carries: there is no
 * column here for mood, signal or check-in status, and there is not going to be one
 * (kb/MVP-SPEC.md §7 — "Rosters may list names. Signals may not attach to them.").
 */
const ROSTER_COLUMNS = ["Last name", "First name", "Email", "Start date", "Site", "Role"] as const;

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "not_found" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly detail: CohortDetailResponse };

/** `entry.start_date` is an ISO calendar date (`YYYY-MM-DD`), never a timestamp. Formatting it
 * by splitting the string (rather than `new Date(...)`) means a date stored as a calendar day
 * never shifts by rendering in the viewer's local time zone. */
function formatStartDate(value: string | null): string {
  if (value === null) return "—";
  const [year, month, day] = value.split("-");
  if (year === undefined || month === undefined || day === undefined) return value;
  return `${month}/${day}/${year}`;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.code === CLIENT_ERROR_CODES.networkUnreachable ||
      error.code === CLIENT_ERROR_CODES.responseNotUnderstood
    ) {
      return "Kayla is not reachable right now. Try again in a moment.";
    }
    return error.message || "Could not load this cohort.";
  }
  return "Could not load this cohort.";
}

/** Name, email, site or role — anything a person would type to find one row in a long roster. */
function matchesQuery(entry: RosterEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return [entry.last_name, entry.first_name, entry.email, entry.site_name, entry.role_title].some(
    (field) => field !== null && field !== undefined && field.toLowerCase().includes(needle),
  );
}

/**
 * How many entries fall under each distinct value of one field, commonest first.
 *
 * This is the whole of the context panel: a roster is a flat list, and "which sites are these
 * people at" is a question you otherwise answer by scrolling and counting. Derived here rather
 * than asked for — `GET /cohorts/{id}` already sends every row, so a second request would be
 * asking the server to count what is already in memory.
 */
function tally(
  entries: readonly RosterEntry[],
  pick: (entry: RosterEntry) => string | null | undefined,
): readonly { readonly label: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const value = pick(entry);
    if (value === null || value === undefined || value.length === 0) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

/** One "Riverside Clinic — 12" row in the context panel. */
function BreakdownCard({
  title,
  rows,
  emptyLabel,
}: {
  readonly title: string;
  readonly rows: readonly { readonly label: string; readonly count: number }[];
  readonly emptyLabel: string;
}) {
  return (
    <Card className="flex flex-col gap-12">
      <h2 className="text-label font-bold text-text-primary">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-meta text-text-tertiary">{emptyLabel}</p>
      ) : (
        <ul className="flex list-none flex-col gap-8 p-[0]">
          {rows.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-12">
              <span className="truncate text-copy text-text-secondary">{row.label}</span>
              <span className="shrink-0 text-label font-extrabold text-text-primary">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function CohortDetailPage() {
  const { id: cohortId } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Reset to "loading" from inside the async body (never synchronously in the effect
      // itself) so a change in `cohortId` re-shows a loading state without React flagging a
      // same-tick setState-in-effect cascade.
      setState({ status: "loading" });
      try {
        const detail = await fetchCohortDetail(cohortId);
        if (!cancelled) setState({ status: "loaded", detail });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "not_found" });
          return;
        }
        setState({ status: "error", message: messageFor(error) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [cohortId]);

  const entries = state.status === "loaded" ? state.detail.entries : [];
  const visible = entries.filter((entry) => matchesQuery(entry, query));
  const cohortLabel = state.status === "loaded" ? state.detail.cohort.label : "Cohort";

  return (
    <AppPage
      header={
        <PageHeader
          backLink={{ href: "/cohorts", label: "← Back to cohorts" }}
          eyebrow="Cohort"
          title={cohortLabel}
          description={
            state.status === "loaded"
              ? entries.length === 1
                ? "1 roster entry"
                : `${entries.length} roster entries`
              : undefined
          }
        />
      }
      toolbar={
        entries.length > 0 ? (
          <SearchField
            label="Search this roster by name, email, site or role"
            placeholder="Search roster…"
            value={query}
            onValueChange={setQuery}
          />
        ) : undefined
      }
      aside={
        entries.length > 0 ? (
          <>
            <BreakdownCard
              title="Sites"
              rows={tally(entries, (entry) => entry.site_name)}
              emptyLabel="No site recorded on any row in this cohort."
            />
            <BreakdownCard
              title="Roles"
              rows={tally(entries, (entry) => entry.role_title)}
              emptyLabel="No role recorded on any row in this cohort."
            />
          </>
        ) : undefined
      }
      asideLabel="Cohort breakdown"
    >
      {state.status === "loading" ? (
        <PageSkeleton label="Loading cohort…" shape="form" count={5} />
      ) : null}

      {state.status === "not_found" ? (
        <EmptyState
          title="No cohort with this id in your organisation"
          description="The link may be from another organisation, or the cohort may have been renamed when a newer roster reassigned its start month."
          action={<LinkButton href="/cohorts" variant="secondary">Back to cohorts</LinkButton>}
        />
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">Could not load this cohort.</p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "loaded" ? (
        <>
          <Table
            caption={`Roster entries in the ${state.detail.cohort.label} cohort`}
            headers={ROSTER_COLUMNS}
          >
            {entries.length === 0 ? (
              <TableEmptyRow colSpan={ROSTER_COLUMNS.length}>
                No roster entries in this cohort.
              </TableEmptyRow>
            ) : null}
            {/* A search that matches nothing says so in the table, in the place the rows would
                have been — not as a page-level empty state, which would read as "this cohort is
                empty" when what happened is "your search found nobody". */}
            {entries.length > 0 && visible.length === 0 ? (
              <TableEmptyRow colSpan={ROSTER_COLUMNS.length}>
                No roster entry matches that search.
              </TableEmptyRow>
            ) : null}
            {visible.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell tone="primary">{entry.last_name}</TableCell>
                <TableCell tone="primary">{entry.first_name}</TableCell>
                <TableCell>{entry.email}</TableCell>
                <TableCell>{formatStartDate(entry.start_date)}</TableCell>
                <TableCell>{entry.site_name ?? "—"}</TableCell>
                <TableCell>{entry.role_title ?? "—"}</TableCell>
              </TableRow>
            ))}
          </Table>
        </>
      ) : null}
    </AppPage>
  );
}
