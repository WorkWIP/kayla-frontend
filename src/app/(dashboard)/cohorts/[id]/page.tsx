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

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, getSession } from "@/api/client";
import type { components } from "@/api/generated";
import { env } from "@/env";

type CohortDetailResponse = components["schemas"]["CohortDetailResponse"];
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

export default function CohortDetailPage() {
  const { id: cohortId } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });

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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-24 p-32">
      <Link
        href="/cohorts"
        className="w-fit text-label font-medium text-text-link underline underline-offset-2"
      >
        ← Back to cohorts
      </Link>

      {state.status === "loading" ? (
        <p role="status" className="text-body text-text-secondary">
          Loading cohort…
        </p>
      ) : null}

      {state.status === "not_found" ? (
        <p className="text-body text-text-secondary">
          No cohort with this id in your organisation.
        </p>
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
          <header className="flex flex-col gap-8">
            <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
              Cohort
            </p>
            <h1 className="text-display-2 text-text-primary">{state.detail.cohort.label}</h1>
            <p className="text-body text-text-secondary">
              {state.detail.entries.length === 1
                ? "1 roster entry"
                : `${state.detail.entries.length} roster entries`}
            </p>
          </header>

          <div className="overflow-x-auto rounded-card border border-hairline-lilac bg-surface-card">
            <table className="w-full text-left text-copy">
              <caption className="sr-only">
                Roster entries in the {state.detail.cohort.label} cohort
              </caption>
              <thead className="bg-surface-warm-gray text-meta font-bold text-text-secondary">
                <tr>
                  <th scope="col" className="px-16 py-12">
                    Last name
                  </th>
                  <th scope="col" className="px-16 py-12">
                    First name
                  </th>
                  <th scope="col" className="px-16 py-12">
                    Email
                  </th>
                  <th scope="col" className="px-16 py-12">
                    Start date
                  </th>
                  <th scope="col" className="px-16 py-12">
                    Site
                  </th>
                  <th scope="col" className="px-16 py-12">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.detail.entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-16 py-12 text-text-secondary">
                      No roster entries in this cohort.
                    </td>
                  </tr>
                ) : null}
                {state.detail.entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-hairline-lilac">
                    <td className="px-16 py-12 text-text-primary">{entry.last_name}</td>
                    <td className="px-16 py-12 text-text-primary">{entry.first_name}</td>
                    <td className="px-16 py-12 text-text-secondary">{entry.email}</td>
                    <td className="px-16 py-12 text-text-secondary">
                      {formatStartDate(entry.start_date)}
                    </td>
                    <td className="px-16 py-12 text-text-secondary">{entry.site_name ?? "—"}</td>
                    <td className="px-16 py-12 text-text-secondary">{entry.role_title ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
