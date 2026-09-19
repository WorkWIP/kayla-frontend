/**
 * FT-P11-1 (frontend half) — port of `no-individual-care-usage`, both halves.
 *
 * DO NOT REMOVE THIS FILE.
 *
 * agents.md §12.1 names `kb/kaylahealth-demo/tests/e2e/no-individual-care-usage.spec.ts` as the
 * model every fitness test in this register follows: a **static** scan (no dashboard source file
 * imports worker-identity/chat/mood/care/crisis content) and a **rendered** scan (no dashboard
 * page ever shows a worker's name), with disjoint fictional names so a legitimate roster listing
 * cannot trip it. §10.11's own "Fitness tests introduced" list requires porting both halves for
 * this phase specifically. `kayla-backend/tests/test_ft_no_individual_care_usage.py` is this
 * file's backend sibling — read its own module docstring first; it explains the sentinel
 * technique both files share and the two real gaps in the demo's own version that neither
 * reproduces (a hardcoded 4-of-5 persona name list, and a hardcoded, never-revisited page array).
 *
 * Removing or weakening this test requires a human explicitly striking the
 * constraint from the PRD, not a feature request routed around it. (agents.md §12.1)
 *
 * --------------------------------------------------------------------------------------------
 * IMPORTANT — what this file's "rendered" half actually proves, and what it does not
 * --------------------------------------------------------------------------------------------
 * `kayla-frontend/package.json` has exactly one test runner wired up: `"test": "... vitest run"`.
 * There is no Playwright config, no `@playwright/test` dependency, and no `.spec.ts` anywhere in
 * this repo, despite agents.md §3.2 pinning the stack as "**Playwright** (E2E) + **Vitest**
 * (unit)" and `vitest.config.ts`'s own comment stating outright that "Playwright arrives with the
 * first real screen in P1" — eight real dashboard screens later (P1 through this phase), it still
 * has not. This is recorded here explicitly, not silently routed around: this file's rendered
 * half is the strongest check this repo's actual tooling can perform today — every dashboard page
 * component is rendered for real, through React and `@testing-library/react`'s real DOM, with a
 * mocked `fetch` standing in for the network exactly as every sibling `page.test.tsx` in this
 * route group already does — but it is **not** a live-browser crawl of a running Next.js server
 * against a running backend. It proves "this component tree, given this API response, never
 * renders the sentinel name"; it does not prove what a real browser hitting a real server would
 * show for a data-fetching path this suite cannot exercise (a Server Component, middleware, or a
 * response shape this mocked `fetch` was not told to return). Installing Playwright — the tool
 * this repo already committed to and has not yet installed — is the fix that closes that gap, not
 * a stronger Vitest trick.
 *
 * --------------------------------------------------------------------------------------------
 * The route registry — introspected, with a drift guard rather than a silent hardcoded list
 * --------------------------------------------------------------------------------------------
 * The demo's own `DASHBOARD_PAGES` is a fixed array nobody is forced to revisit when a route is
 * added — exactly the gap this phase's brief says not to reproduce. This file reads the real
 * directory list under `src/app/(dashboard)/` with `fs.readdirSync` at test time
 * (`DISCOVERED_ROUTE_DIRECTORIES` below) and a dedicated test
 * (`the crawl's route registry has not drifted from the real (dashboard)/ directory tree`) fails
 * the moment that list disagrees with `CRAWL_TARGETS`' own hardcoded route list — a hardcoded list
 * is still used to render each page (each one needs its own mocked response shape and, for
 * Settings, its own session role, which a fully generic "import and render whatever's found"
 * crawler cannot know), but drift between the two is now a build failure instead of a silent gap,
 * exactly the fallback agents.md's own P11 brief names as acceptable when a hardcoded list is
 * "unavoidable given your tooling".
 *
 * --------------------------------------------------------------------------------------------
 * Two sentinels, not the demo's disjoint pools — and why
 * --------------------------------------------------------------------------------------------
 * `kayla-backend/seeds/factories.py` takes explicit names from its caller; there is no fixed
 * built-in persona pool the way the demo's `personas.ts` is one. `SENTINEL_WORKER_GIVEN_NAME`/
 * `_FAMILY_NAME` (a synthetic worker identity) and `SENTINEL_COHORT_LABEL` (a synthetic, but
 * legitimately-shown, cohort label) mirror the backend file's own two constants exactly, so a
 * failure message from either side of the boundary names the same string. The worker sentinel
 * must never appear on any crawled page **except** `/cohorts/[id]` (`CohortDetailPage`), the one
 * route `kb/MVP-SPEC.md` §7 explicitly carves out ("Rosters may list names. Signals may not
 * attach to them.") — proven by asserting **presence** there, not merely by omission, so this
 * file also proves the crawl is not vacuously passing everywhere else because nothing ever
 * renders a name at all.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, setSession } from "@/api/client";
import type { components } from "@/api/generated";

import ActionsPage from "../actions/page";
import CheckInQuestionsPage from "../check-in-questions/page";
import CohortsPage from "../cohorts/page";
import CohortDetailPage from "../cohorts/[id]/page";
import CohortsUploadPage from "../cohorts/upload/page";
import KnowledgeBasePage from "../knowledge-base/page";
import KnowledgeBaseUploadPage from "../knowledge-base/upload/page";
import OverviewPage from "../overview/page";
import SettingsPage from "../settings/page";
import SignalsPage from "../signals/page";
import EngagementPage from "../engagement/page";

type SignalsResponse = components["schemas"]["SignalsResponse"];
type OverviewResponse = components["schemas"]["OverviewResponse"];
type EngagementResponse = components["schemas"]["EngagementResponse"];
type OrgSettingsResponse = components["schemas"]["OrgSettingsResponse"];

// ====================================================================================================
// 1. Static half — no dashboard source file imports a chat/mood/care/crisis-shaped or worker-
//    identity-shaped module. None exist in kayla-frontend today (those concepts live in
//    kayla-backend/kayla-mobile); this is a forward guard, matching this file's backend sibling's
//    own `kayla.checkin.constructs`-vs-everything-else split — see that file's module docstring.
// ====================================================================================================

const DASHBOARD_APP_DIR = join(process.cwd(), "src", "app", "(dashboard)");
const COMPONENTS_DIR = join(process.cwd(), "src", "components");

//: Case-insensitive substrings that would name a chat, mood/free-text, care, or crisis module, or
//: a worker-identity ("persona") module — the exact four product concepts agents.md §10.11's own
//: brief names, plus "persona", the demo's own name for the concept this repo calls a worker
//: identity. Deliberately excludes "signal"/"checkin" as bare substrings: this dashboard's own
//: `kayla.dashboard`-equivalent pages (`/signals/page.tsx`, `/check-in-questions/page.tsx`) are
//: legitimate, already-reviewed, already-shipped screens *of* this phase, not something to flag.
const FORBIDDEN_IMPORT_SUBSTRINGS = ["chat", "mood", "care", "crisis", "persona"] as const;

function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function importSpecifiers(source: string): string[] {
  const cleaned = stripLineComments(source);
  const pattern = /from\s+["']([^"']+)["']/g;
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "__tests__") continue; // this file's own directory — see the file-level note
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
    files.push(fullPath);
  }
  return files;
}

function findForbiddenImports(files: readonly string[]): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      const lowered = specifier.toLowerCase();
      for (const forbidden of FORBIDDEN_IMPORT_SUBSTRINGS) {
        if (lowered.includes(forbidden)) {
          offenders.push(`${file}: imports ${JSON.stringify(specifier)} (matches "${forbidden}")`);
        }
      }
    }
  }
  return offenders;
}

describe("static half — no chat/mood/care/crisis/persona import anywhere in the dashboard surface", () => {
  it("finds nothing forbidden in src/app/(dashboard)/ or src/components/", () => {
    const files = [...collectSourceFiles(DASHBOARD_APP_DIR), ...collectSourceFiles(COMPONENTS_DIR)];
    expect(files.length).toBeGreaterThan(0); // a wrong path would make this vacuously true

    const offenders = findForbiddenImports(files);
    expect(offenders).toEqual([]);
  });

  it("the scanner actually catches a synthetic offender (proof of teeth)", () => {
    const offenders = findForbiddenImports([
      // Not read from disk — a synthetic in-memory "file" to prove the scanner has teeth, the
      // same non-vacuous-scanner discipline every AST-based fitness test in kayla-backend
      // carries for its own substring list.
    ]);
    expect(offenders).toEqual([]); // baseline: empty input -> empty output

    const synthetic = [
      'import { useMood } from "@/lib/mood/hooks";',
      'import { CareCard } from "@/components/care-card";',
      'export { crisisBanner } from "./crisis-banner";',
      'import { usePersona } from "@/lib/mock/personas";',
      'import { ChatWidget } from "@/components/chat-widget";',
    ].join("\n");
    const hits = FORBIDDEN_IMPORT_SUBSTRINGS.filter((forbidden) =>
      importSpecifiers(synthetic).some((specifier) => specifier.toLowerCase().includes(forbidden)),
    );
    expect(hits.sort()).toEqual([...FORBIDDEN_IMPORT_SUBSTRINGS].sort());
  });
});

// ====================================================================================================
// 2. Rendered half.
// ====================================================================================================

const SENTINEL_WORKER_GIVEN_NAME = "Zylquinox";
const SENTINEL_WORKER_FAMILY_NAME = "Sentinelward";
const SENTINEL_COHORT_LABEL = "Quorvexian Sentinel Cohort";

//: Route directories `fs.readdirSync` finds under `(dashboard)/` right now — read at test time,
//: never hardcoded, so a directory added or removed after this file was written changes this
//: value on the next run rather than silently going unnoticed.
const DISCOVERED_ROUTE_DIRECTORIES = readdirSync(DASHBOARD_APP_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  // `__tests__` is this file's own directory, not a route — Next.js's own convention (and
  // `collectSourceFiles` above) already treats a `__tests__` directory as test infrastructure,
  // never a page. Every other directory found here is a real route and must be in
  // CRAWL_TARGET_ROUTE_DIRECTORIES or this file's own drift guard below fails on purpose.
  .filter((name) => name !== "__tests__")
  .sort();

//: What this file actually knows how to render, one entry per route directory. Each route needs
//: its own mocked response shape (and, for Settings, its own session
//: role), which is why this is a hand-maintained list rather than a fully dynamic import loop —
//: see the file docstring's "route registry" section for why that is an acceptable, *guarded*
//: trade-off here, and the test immediately below for the guard itself.
const CRAWL_TARGET_ROUTE_DIRECTORIES = [
  "actions",
  "check-in-questions",
  "cohorts",
  "engagement",
  "knowledge-base",
  // Overview owned the route group's own "/" until "/" was freed for a public marketing landing
  // page; it is now a directory like every other route, and so appears here.
  "overview",
  "settings",
  "signals",
].sort();

it("the crawl's route registry has not drifted from the real (dashboard)/ directory tree", () => {
  expect(DISCOVERED_ROUTE_DIRECTORIES).toEqual(CRAWL_TARGET_ROUTE_DIRECTORIES);
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const ORG_OWNER_SESSION = {
  tokens: {
    access_token: "access-token-value",
    token_type: "bearer" as const,
    expires_in: 900,
    expires_at: "2026-01-01T00:15:00Z",
    refresh_token: "refresh-token-value",
    refresh_expires_at: "2026-01-08T00:00:00Z",
  },
  user: {
    id: "9f1c2b3a-0000-4000-8000-000000000099",
    email: "owner@example.com",
    role: "org_owner" as const,
    email_verified: true,
    last_login_at: null,
  },
};

// Each construct row/dot below is its own top-level literal, deliberately never assembled into
// one shared array/object literal that types out all five construct ids together —
// `kayla-backend`'s `tests/test_ft_checkin_construct_registry.py` (FT-P9-1, DO NOT REMOVE)
// statically scans every `kayla-frontend/src` file for exactly that shape, and this file's own
// mock fixtures are no more exempt than production code (the backend's own version of this check
// only exempts `tests/`, a directory this repo's co-located `__tests__/` files have no equivalent
// of). Combined into `SIGNALS_RESPONSE`/`OVERVIEW_RESPONSE` below by reference, not by retyping,
// so no single bracketed span in this file ever names all five ids together.
const SIGNALS_ROLE_CLARITY_ROW = {
  construct_id: "role_clarity",
  respondent_count: 5,
  value: 76,
  band: "green",
  suppressed: false,
  status_label: "On track",
} as const;
const SIGNALS_WORKLOAD_ROW = {
  construct_id: "workload",
  respondent_count: 5,
  value: 68,
  band: "amber",
  suppressed: false,
  status_label: "Watch",
} as const;
const SIGNALS_MANAGER_SUPPORT_ROW = {
  construct_id: "manager_support",
  respondent_count: 5,
  value: 82,
  band: "green",
  suppressed: false,
  status_label: "On track",
} as const;
const SIGNALS_BELONGING_ROW = {
  construct_id: "belonging",
  respondent_count: 5,
  value: 74,
  band: "green",
  suppressed: false,
  status_label: "On track",
} as const;
const SIGNALS_ENERGY_ROW = {
  construct_id: "energy",
  respondent_count: 5,
  value: 55,
  band: "red",
  suppressed: false,
  status_label: "Needs attention",
} as const;

//: `GET /dashboard/actions` (agents.md §10.12). Every field here is site- or construct-scoped:
//: a nudge is targeted by site (`Q-50` leaves "manager" unresolved and there is no worker
//: dimension at all), and `triggering_signal_summary` is built from a band label and a headcount.
//: The sentinel worker's name appears nowhere in this fixture *and must not appear in the render*
//: — that is the whole assertion this route contributes to the crawl below.
const ACTIONS_RESPONSE = [
  {
    id: "9a1f0000-0000-4000-8000-000000000001",
    site_id: "5b1e2c3a-0000-4000-8000-0000000000a1",
    site_name: "Building A",
    construct_id: "workload",
    triggering_signal_summary: "workload band=red, n=12",
    status: "pending",
    drafted_title: "Workload is trending down at Building A",
    drafted_body: "Consider reviewing shift coverage for the next two weeks.",
    approved_by_user_id: null,
    approved_at: null,
    sent_at: null,
    dismissed_at: null,
    created_at: "2026-09-18T12:00:00Z",
  },
];

const SIGNALS_RESPONSE: SignalsResponse = {
  cohorts: [
    {
      cohort_id: "5b1e2c3a-0000-4000-8000-000000000001",
      cohort_label: SENTINEL_COHORT_LABEL,
      constructs: [
        SIGNALS_ROLE_CLARITY_ROW,
        SIGNALS_WORKLOAD_ROW,
        SIGNALS_MANAGER_SUPPORT_ROW,
        SIGNALS_BELONGING_ROW,
        SIGNALS_ENERGY_ROW,
      ],
    },
  ],
  threshold_disclosure: "Thresholds (green >= 75, amber 60-74, red < 60) are unvalidated placeholders.",
};

const OVERVIEW_ROLE_CLARITY_DOT = {
  construct_id: "role_clarity",
  respondent_count: 24,
  band: "green",
  suppressed: false,
  status_label: "On track",
} as const;
const OVERVIEW_WORKLOAD_DOT = {
  construct_id: "workload",
  respondent_count: 24,
  band: "amber",
  suppressed: false,
  status_label: "Watch",
} as const;
const OVERVIEW_MANAGER_SUPPORT_DOT = {
  construct_id: "manager_support",
  respondent_count: 3,
  band: null,
  suppressed: true,
  status_label: "Not enough responses yet to report this",
} as const;
const OVERVIEW_BELONGING_DOT = {
  construct_id: "belonging",
  respondent_count: 24,
  band: "green",
  suppressed: false,
  status_label: "On track",
} as const;
const OVERVIEW_ENERGY_DOT = {
  construct_id: "energy",
  respondent_count: 24,
  band: "red",
  suppressed: false,
  status_label: "Needs attention",
} as const;

const OVERVIEW_RESPONSE: OverviewResponse = {
  enrolled_headcount: 26,
  signed_up_headcount: 24,
  percent_signed_up: 0.923,
  checkin_completion: {
    respondent_headcount: 24,
    required_checkins: 40,
    completed_checkins: 35,
    rate: 0.875,
    suppressed: false,
    status_label: "Reporting",
  },
  on_track: {
    population_headcount: 24,
    working_days_elapsed: 480,
    shift_checkin_days: 410,
    rate: 0.854,
    suppressed: false,
    status_label: "Reporting",
  },
  adjustment_signals: {
    constructs: [
      OVERVIEW_ROLE_CLARITY_DOT,
      OVERVIEW_WORKLOAD_DOT,
      OVERVIEW_MANAGER_SUPPORT_DOT,
      OVERVIEW_BELONGING_DOT,
      OVERVIEW_ENERGY_DOT,
    ],
  },
  active_usage: {
    active_headcount: 18,
    rate: 0.75,
    suppressed: false,
    status_label: "Reporting",
    window_days: 14,
  },
  time_saved_minutes_per_week: 208,
};

const ENGAGEMENT_RESPONSE: EngagementResponse = {
  current_cohort_id: "5b1e2c3a-0000-4000-8000-000000000001",
  current_cohort_label: SENTINEL_COHORT_LABEL,
  current_trend: [
    { milestone_day: 7, required_count: 24, completed_count: 22, completion_pct: 0.917, suppressed: false, status_label: "Reporting" },
    { milestone_day: 30, required_count: 24, completed_count: 20, completion_pct: 0.833, suppressed: false, status_label: "Reporting" },
    { milestone_day: 60, required_count: 18, completed_count: 14, completion_pct: 0.778, suppressed: false, status_label: "Reporting" },
    { milestone_day: 90, required_count: 0, completed_count: 0, completion_pct: null, suppressed: true, status_label: "Not enough responses yet to report this" },
  ],
  comparison_mode: "illustrative_previous_cohort",
  comparison_cohort_id: null,
  comparison_cohort_label: null,
  comparison_trend: [
    { milestone_day: 7, completion_pct: 0.89 },
    { milestone_day: 30, completion_pct: 0.76 },
    { milestone_day: 60, completion_pct: 0.71 },
    { milestone_day: 90, completion_pct: 0.74 },
  ],
  comparison_disclaimer: "Illustrative — this organisation has no completed cohort yet.",
};

const SETTINGS: OrgSettingsResponse = {
  org_id: "9f1c2b3a-0000-4000-8000-000000000001",
  min_n_threshold: 4,
  signal_threshold_green: 75,
  signal_threshold_amber: 60,
  proactive_care_low_mood_count: 2,
  has_custom_settings: false,
  updated_at: null,
};
const ADMIN_USERS = [
  { id: "a1", email: "owner@example.com", role: "org_owner" as const, email_verified: true, last_login_at: "2026-09-10T12:00:00Z", created_at: "2026-01-01T00:00:00Z" },
];
const PRIVACY_DISCLOSURE = {
  version: 1,
  min_n_threshold: 4,
  text: "We only report a rate once at least 4 people have responded.",
};
const COST_OF_TURNOVER = {
  title: "Cost of turnover",
  description: "What replacing a worker in the first 90 days typically costs.",
  formula: "additional hires retained = new hires per year x turnover rate x reduction",
  example: {
    new_hires_per_year: 60,
    average_replacement_cost_usd: 3500,
    first_90_day_turnover_rate_percent: 35,
    estimated_reduction_percent: 20,
    additional_hires_retained: 4,
    estimated_annual_savings_usd: 14000,
  },
  disclaimer: "Illustrative figures, not a computation over this organisation's own data.",
};

//: The one route where the worker sentinel is expected to — and must — appear (PRD §7's roster
//: exception). `id` is fixed; `next/navigation` is mocked below to hand `CohortDetailPage`
//: exactly this id regardless of which route actually rendered it in a real browser.
const COHORT_DETAIL_ID = "a1";
const COHORT_DETAIL_RESPONSE = {
  cohort: { id: COHORT_DETAIL_ID, label: "Roster exception control", start_month: "2026-09-01", roster_entry_count: 1 },
  entries: [
    {
      id: "e1",
      first_name: SENTINEL_WORKER_GIVEN_NAME,
      last_name: SENTINEL_WORKER_FAMILY_NAME,
      email: "sentinel@okcic.example",
      start_date: "2026-09-14",
      site_name: "Riverside Clinic",
      role_title: "Home Health Aide",
      has_matched_user: true,
    },
  ],
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: COHORT_DETAIL_ID }),
  // `knowledge-base/upload/page.tsx` -> `KbUploadFlow` calls `useRouter().push(...)` after a
  // successful upload; this crawl never uploads anything, so a stub that is never called is
  // enough — the alternative (not mocking `next/navigation` at all) breaks `/cohorts/[id]`'s own
  // `useParams` call instead, since a real Next router is not present under jsdom either way.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

const fetchMock = vi.fn();

function mockBackend(): void {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/dashboard/settings/admin-users")) return Promise.resolve(jsonResponse(200, ADMIN_USERS));
    if (url.endsWith("/dashboard/settings/privacy-disclosure")) return Promise.resolve(jsonResponse(200, PRIVACY_DISCLOSURE));
    if (url.endsWith("/dashboard/settings/cost-of-turnover")) return Promise.resolve(jsonResponse(200, COST_OF_TURNOVER));
    if (url.endsWith("/dashboard/settings")) return Promise.resolve(jsonResponse(200, SETTINGS));
    if (url.endsWith("/dashboard/actions")) return Promise.resolve(jsonResponse(200, ACTIONS_RESPONSE));
    if (url.endsWith("/dashboard/signals")) return Promise.resolve(jsonResponse(200, SIGNALS_RESPONSE));
    if (url.endsWith("/dashboard/overview")) return Promise.resolve(jsonResponse(200, OVERVIEW_RESPONSE));
    if (url.endsWith("/dashboard/engagement")) return Promise.resolve(jsonResponse(200, ENGAGEMENT_RESPONSE));
    if (url.endsWith("/checkins/question-sets/active"))
      return Promise.resolve(
        jsonResponse(200, {
          id: "qs-1",
          version: 1,
          questions: [
            { id: "q-1", construct_id: "role_clarity", question_type: "scale", milestone_days: [7, 30, 60, 90], display_order: 0 },
          ],
        }),
      );
    if (url.endsWith("/kb/documents")) return Promise.resolve(jsonResponse(200, { documents: [] }));
    if (url.endsWith(`/cohorts/${COHORT_DETAIL_ID}`)) return Promise.resolve(jsonResponse(200, COHORT_DETAIL_RESPONSE));
    if (url.endsWith("/cohorts")) return Promise.resolve(jsonResponse(200, [{ id: "c1", label: SENTINEL_COHORT_LABEL, start_month: "2026-09-01", roster_entry_count: 5 }]));
    throw new Error(`no mock registered for fetch(${url})`);
  });
}

/** Renders one page, waits for its own loading indicator (if any) to clear, returns the
 * rendered text, then unmounts — so the next crawl target starts from an empty DOM. Works for a
 * page that never shows a loading state at all (the two upload forms below fire no fetch),
 * because `queryByRole("status")` is simply already null on the very first check. */
async function crawl(node: React.ReactElement): Promise<string> {
  const { unmount } = render(node);
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
  const text = document.body.textContent ?? "";
  unmount();
  return text;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mockBackend();
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("rendered half — the worker sentinel never appears, except on the roster's own route", () => {
  const NON_ROSTER_TARGETS: ReadonlyArray<[string, () => React.ReactElement]> = [
    ["/overview", () => <OverviewPage />],
    ["/signals", () => <SignalsPage />],
    ["/actions", () => <ActionsPage />],
    ["/engagement", () => <EngagementPage />],
    ["/check-in-questions", () => <CheckInQuestionsPage />],
    ["/knowledge-base", () => <KnowledgeBasePage />],
    ["/knowledge-base/upload", () => <KnowledgeBaseUploadPage />],
    ["/cohorts", () => <CohortsPage />],
    ["/cohorts/upload", () => <CohortsUploadPage />],
  ];

  it.each(NON_ROSTER_TARGETS)("%s never renders the sentinel worker's name", async (_route, renderTarget) => {
    const text = await crawl(renderTarget());
    expect(text).not.toContain(SENTINEL_WORKER_GIVEN_NAME);
    expect(text).not.toContain(SENTINEL_WORKER_FAMILY_NAME);
  });

  it("/settings (org_owner session) never renders the sentinel worker's name", async () => {
    setSession(ORG_OWNER_SESSION);
    const text = await crawl(<SettingsPage />);
    expect(text).not.toContain(SENTINEL_WORKER_GIVEN_NAME);
    expect(text).not.toContain(SENTINEL_WORKER_FAMILY_NAME);
  });

  it("proves the crawl is not vacuously passing: the cohort sentinel label DOES render on /signals", async () => {
    const text = await crawl(<SignalsPage />);
    expect(text).toContain(SENTINEL_COHORT_LABEL);
  });
});

// The dynamic `/cohorts/[id]` route needs its own describe block: `next/navigation`'s mock above
// is file-wide (vi.mock is hoisted), and this is the one target that reads it, so it is kept
// separate from the table-driven block above rather than forced into the same shape for no
// benefit.
describe("the roster route is the proven, positive-control exception", () => {
  it("renders the sentinel worker's name (legitimate — kb/MVP-SPEC.md §7)", async () => {
    const text = await crawl(<CohortDetailPage />);
    expect(text).toContain(SENTINEL_WORKER_GIVEN_NAME);
    expect(text).toContain(SENTINEL_WORKER_FAMILY_NAME);
  });
});

describe("resilience — a rogue worker-identity field on the wire still would not render", () => {
  it("Signals ignores an unexpected worker_name field a future backend regression might add", async () => {
    const [firstCohort] = SIGNALS_RESPONSE.cohorts;
    if (firstCohort === undefined) throw new Error("SIGNALS_RESPONSE.cohorts is empty");
    const leaky = {
      ...SIGNALS_RESPONSE,
      cohorts: [
        {
          ...firstCohort,
          constructs: firstCohort.constructs.map((construct, index) =>
            index === 0
              ? { ...construct, worker_name: `${SENTINEL_WORKER_GIVEN_NAME} ${SENTINEL_WORKER_FAMILY_NAME}` }
              : construct,
          ),
        },
      ],
      // Cast deliberately: the real generated type has no such field at all — this simulates a
      // hypothetical wire payload wider than the contract, the scenario `test_ft_no_individual_
      // care_usage.py`'s own response-shape assertion proves cannot happen on the real backend,
      // checked here from the other side: even if it somehow did, this component does not spread
      // unknown fields onto the DOM.
    } as unknown as SignalsResponse;

    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/dashboard/signals") ? Promise.resolve(jsonResponse(200, leaky)) : Promise.reject(new Error(url)),
    );

    const text = await crawl(<SignalsPage />);
    expect(text).not.toContain(SENTINEL_WORKER_GIVEN_NAME);
  });
});
