"use client";

/**
 * `/check-in-questions` — the dashboard configuration surface for the check-in question registry
 * (agents.md §10.9 task 7).
 *
 * --------------------------------------------------------------------------------------------
 * What this screen is, and — just as load-bearingly — what it is not
 * --------------------------------------------------------------------------------------------
 * This reads `GET /checkins/question-sets/active` (`kayla.checkin.router`, built by a separate
 * task in this same phase) and renders the org's currently-active question set: which construct
 * each question asks about, what shape the answer takes, and which milestone days it fires on.
 * It is **not** the Signals results-visualization dashboard (P11, agents.md §10.11) — no worker
 * response ever appears here, scored or free-text, aggregated or otherwise. This screen only
 * shows *which questions are asked*, never any answer to one. Nothing here imports from
 * `kayla.checkin.constructs` or any equivalent — see `checkin-question-card.tsx`'s own docstring
 * for why that would defeat this phase's own fitness test.
 *
 * --------------------------------------------------------------------------------------------
 * Read-only, deliberately, matching what actually exists on the backend
 * --------------------------------------------------------------------------------------------
 * `kayla.checkin.router`'s own module docstring is explicit that this phase ships no write
 * endpoint for the registry — the schema and read path only, with an add/remove/reorder/toggle
 * surface deferred until `Q-25` (per-org question sets) is answered and an org actually needs a
 * second configuration. There is nothing to wire a toggle or a drag handle to yet, so this screen
 * has none: building one against an endpoint that does not exist would be exactly the "fake write
 * functionality" this task was told not to build. The moment a write endpoint lands, this file is
 * where it gets wired in — the page already renders the full ordered list a reorder/toggle UI
 * would operate on.
 *
 * --------------------------------------------------------------------------------------------
 * Fetch pattern
 * --------------------------------------------------------------------------------------------
 * A client component for the same reason `/cohorts` and `/knowledge-base` are (`src/api/
 * client.ts`'s session lives in memory only; `DashboardShell` has already confirmed a session
 * before this page mounts). Uses `apiRequest` against the generated client — unlike
 * `/knowledge-base` at the time it was written, `GET /checkins/question-sets/active` **is**
 * already in `kayla-backend/openapi.json` (the other P9 task that built the router regenerated
 * it), so `npm run codegen` was re-run against that file before this page was written and there
 * is no hand-rolled-fetch fallback here.
 *
 * i18n (agents.md §11.2 check 12, §8.4): every other file in this route group
 * (`/cohorts/page.tsx`, `/knowledge-base/page.tsx`) hardcodes its user-facing copy as plain
 * English JSX text — `next-intl` (agents.md §3.2's stated choice) is not installed in
 * `kayla-frontend` and no `messages/{en,es}.json` pair exists here despite §8.4's "EN + ES ship
 * together from P4." That gap predates this task and spans every dashboard screen, not just this
 * one; retrofitting i18n for one new screen while every existing one stays English-only would
 * make this file inconsistent with its own siblings without closing the gap it is part of. This
 * file follows the convention that actually exists on disk — see this task's own final report for
 * the gap named explicitly, with the fix scoped to whichever phase reconciles it for the whole
 * dashboard at once.
 */

import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import { CheckinQuestionCard } from "@/components/checkin-question-card";
import type { CheckinQuestion } from "@/components/checkin-question-card";
import { AppPage } from "@/components/ui/app-page";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import type { TabItem } from "@/components/ui/tabs";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "empty" }
  | { readonly status: "loaded"; readonly version: number; readonly questions: readonly CheckinQuestion[] };

const GENERIC_FAILURE = "Could not load the check-in question set. Try again in a moment.";
const FORBIDDEN_MESSAGE =
  "You do not have access to this page. Check-in question settings are visible to HR admins and org owners only.";

/** `kayla.checkin.service.CheckinQuestionSetNotFoundError.code` — every seeded org gets a v1 set
 * (agents.md §10.9 task 2), so this is expected only for an org this phase's seeds never reached,
 * not a failure worth an alert. */
const NO_ACTIVE_SET_CODE = "checkin_question_set_not_found";

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

/* -------------------------------------------------------------------------------------------
 * Filtering by milestone
 *
 * A question belongs to *several* milestones — `milestone_days` is a list, and the common case is
 * a question asked at day 7 and again at day 90. So this filters rather than groups: grouping
 * would print the same question under four headings and make a set of six questions look like a
 * set of twenty.
 *
 * The days are read off the data, never hardcoded to 7/30/60/90. A question set is configured per
 * organisation by Kayla Ops, and a hardcoded strip would silently hide a milestone someone had
 * actually configured.
 *
 * The labels read "7 days", not "Day 7", and that is load-bearing rather than stylistic: the
 * cards below render "Day 7" chips, and a filter control carrying the identical string would be
 * ambiguous both to a person scanning the screen and to a test looking for one of them.
 * ---------------------------------------------------------------------------------------- */

const ALL_MILESTONES = "all";

/** Every milestone any question in the set is asked at, ascending. */
function milestoneDaysIn(questions: readonly CheckinQuestion[]): readonly number[] {
  const days = new Set<number>();
  for (const question of questions) {
    for (const day of question.milestone_days) days.add(day);
  }
  return [...days].sort((left, right) => left - right);
}

export default function CheckInQuestionsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [milestone, setMilestone] = useState<string>(ALL_MILESTONES);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const questionSet = await apiRequest("get", "/checkins/question-sets/active", {});
        if (cancelled) return;
        setState({
          status: "loaded",
          version: questionSet.version,
          // The API already orders by `display_order` (`ActiveQuestionSetResponse`'s own
          // docstring) — sorted again here defensively, since this screen's whole point is
          // accurate ordering and a future backend change to that guarantee should not silently
          // reshuffle the list a reorder UI will eventually operate on.
          questions: [...questionSet.questions].sort((a, b) => a.display_order - b.display_order),
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === NO_ACTIVE_SET_CODE) {
          setState({ status: "empty" });
          return;
        }
        setState({ status: "error", message: messageFor(error) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const questions = state.status === "loaded" ? state.questions : [];
  const days = milestoneDaysIn(questions);
  const visible =
    milestone === ALL_MILESTONES
      ? questions
      : questions.filter((question) => question.milestone_days.includes(Number(milestone)));

  // One milestone is not a choice, so the strip only appears once there is something to choose
  // between.
  const filterable = days.length > 1;
  const milestoneTabs: readonly TabItem[] = [
    { key: ALL_MILESTONES, label: "All questions", count: questions.length },
    ...days.map((day) => ({
      key: String(day),
      label: `${day} days`,
      count: questions.filter((question) => question.milestone_days.includes(day)).length,
    })),
  ];

  return (
    <AppPage
      header={
        <PageHeader
          eyebrow="Check-in Questions"
          title="Check-in Questions"
          description="What Kayla asks new hires at each milestone check-in, and when. This view shows the current, active question set for this organization. Editing is not available yet."
        />
      }
      tabs={
        filterable ? (
          <Tabs
            items={milestoneTabs}
            activeKey={milestone}
            onChange={setMilestone}
            label="Filter by milestone"
          />
        ) : undefined
      }
    >
      {state.status === "loading" ? <PageSkeleton label="Loading the question set…" /> : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">
            Could not load the check-in question set.
          </p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "empty" ? (
        <EmptyState
          title="No active check-in question set"
          description="Nothing is configured for this organization yet, so Kayla is not asking new hires anything at a milestone. Kayla Ops sets the first question set up with you — there is nothing to do here in the meantime."
        />
      ) : null}

      {state.status === "loaded" ? (
        <div className="flex flex-col gap-16">
          <p className="text-meta font-medium text-text-tertiary">
            {`Question set v${state.version} · ${state.questions.length} question${
              state.questions.length === 1 ? "" : "s"
            }`}
          </p>
          {questions.length === 0 ? (
            <EmptyState
              title="This question set has no questions"
              description="The set is active but empty, so no milestone check-in will ask anything. Kayla Ops can add questions to it."
            />
          ) : (
            <TabPanel tabKey={milestone} activeKey={milestone}>
              {/* `position` stays the question's place in the *set*, not in the filtered view:
                  the ordinal is how Kayla Ops refers to a question, and renumbering it as you
                  filter would make two people looking at the same set disagree about which one
                  is "question 3". */}
              <ul
                aria-label="Check-in questions"
                className="grid list-none grid-cols-1 gap-16 p-[0] xl:grid-cols-2 2xl:grid-cols-3"
              >
                {questions.map((question, index) =>
                  visible.includes(question) ? (
                    <CheckinQuestionCard
                      key={question.id}
                      question={question}
                      position={index + 1}
                    />
                  ) : null,
                )}
              </ul>
            </TabPanel>
          )}
        </div>
      ) : null}
    </AppPage>
  );
}
