"use client";

/**
 * `/actions` — the Actions dashboard (agents.md §10.12 P12: "Actions (AI-drafted nudges)").
 *
 * --------------------------------------------------------------------------------------------
 * What a "nudge" is, and what this screen lets HR do with one
 * --------------------------------------------------------------------------------------------
 * A nudge is a short piece of copy Kayla drafts from a site's adjustment-signal data (task 1:
 * "Nudges generated from adjustment signals, not a static list") and offers to a site's
 * leadership. Drafting itself happens off-screen and asynchronously (task 2: "Drafted by gpt-5
 * over policies + prior nudges + signal aggregates. Async — quality over latency"), so this page
 * is read-only with respect to *content*: it never writes `drafted_title`/`drafted_body`, only
 * the approval state layered on top of them.
 *
 * The state machine (task 3) is `draft -> pending -> approved -> sent`, with `dismissed` reachable
 * from `pending`. This page only ever calls the two write endpoints for a `pending` nudge —
 * `POST /dashboard/actions/{id}/approve` and `.../dismiss` — because those are the only
 * transitions an HR admin or org owner actually drives; every other status here is a read-only
 * report of where a nudge already is.
 *
 * --------------------------------------------------------------------------------------------
 * The four design questions this phase left open — resolved conservatively, not re-litigated here
 * --------------------------------------------------------------------------------------------
 * agents.md §10.12 flags all four of `Q-47`–`Q-50` as open. This file follows the conservative
 * reading each was given before this task started, and does not attempt to build past it:
 *
 * - `Q-47` (input set): the input side is entirely the sibling backend task's concern — this page
 *   only ever renders whatever `GET /dashboard/actions` sends.
 * - `Q-48` (approval workflow): approve or dismiss, no edit-before-approving. There is
 *   deliberately no textarea, no "regenerate", no inline editor anywhere below —
 *   `drafted_title`/`drafted_body` are rendered exactly as the API sent them, the same way
 *   `kb-document-card.tsx` renders `status_display` verbatim rather than re-deriving it.
 * - `Q-49` (delivery channel): unresolved and backend-internal, flagged off by default. A `sent`
 *   nudge is shown with that status and nothing more — no "how the manager will see this"
 *   affordance, no delivery-channel picker, no send button of this page's own. Sending is not a
 *   user action this UI exposes at all.
 * - `Q-50` (manager entity): there is no manager entity in this build. Every nudge here is
 *   targeted by **site only** (`site_id`/`site_name`) — never a manager, never an individual
 *   worker. This file has no manager- or worker-shaped field anywhere in its types.
 *
 * --------------------------------------------------------------------------------------------
 * Never an individual worker's name — agents.md §10.12's own fitness test
 * --------------------------------------------------------------------------------------------
 * "A drafted nudge's rendered content never contains an individual worker name." The API already
 * enforces this at the source (a nudge is site+construct scoped, never worker scoped — see `Q-50`
 * above), but this file keeps the discipline on the rendering side too: `drafted_title` and
 * `drafted_body` are dropped straight into JSX text nodes, verbatim, with no markdown rendering,
 * no `dangerouslySetInnerHTML`, and no template-string interpolation of any other field into
 * them. A future backend bug that let a name slip into that copy would still just show as plain
 * text here, not get formatted, linked, or amplified by this page.
 *
 * --------------------------------------------------------------------------------------------
 * `GET /dashboard/actions` and the two `POST .../{id}/{approve,dismiss}` routes are hand-typed
 * --------------------------------------------------------------------------------------------
 * This frontend task ran concurrently with the backend task that owns `kayla-backend`'s nudges
 * router, so `kayla-backend/openapi.json` does not carry these three routes as of this writing —
 * `npm run codegen` cannot produce `paths["/dashboard/actions"]` from a contract that does not
 * have it yet. `kb-upload-flow.tsx` and `roster-upload-flow.tsx` already established the pattern
 * for exactly this situation: hand-roll the request (same `ApiError`, same `{error: {code,
 * message, details}}` envelope handling `src/api/client.ts`'s real `apiRequest` uses) rather than
 * block on a contract that cannot exist yet, or invent a generated-looking type that isn't real.
 * `Nudge`/`DashboardActionsResponse` below are typed field-for-field against this phase's own
 * fixed response contract (agents.md §10.12's task brief), not guessed. Replace these with real
 * generated types — and delete this paragraph — the next time `openapi.json` is regenerated
 * against the nudges router and `npm run codegen` is run against it.
 *
 * --------------------------------------------------------------------------------------------
 * Fetch pattern, role visibility, and i18n
 * --------------------------------------------------------------------------------------------
 * A client component for the same reason every other dashboard route is one (`src/api/client.ts`'s
 * session lives in memory only; `DashboardShell` has already confirmed a session before this page
 * mounts). No client-side role gate is added — `signals/page.tsx` and `(dashboard)/page.tsx`
 * (Overview) take the identical approach for the same HR-admin-or-org-owner audience: the backend
 * is the real enforcement layer (agents.md §6.2), and a 403 that arrives anyway renders as an
 * ordinary error alert via `messageFor` below, same as any other failure.
 *
 * i18n: no `next-intl` install and no `messages/{en,es}.json` pair exist in this repo — see
 * `signals/page.tsx` and `check-in-questions/page.tsx`'s own docstrings, which name this gap as
 * spanning every dashboard screen, not one file's oversight. This page follows the same on-disk
 * convention: plain English JSX text, no new i18n pattern introduced on this one page alone.
 */

import { useEffect, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, getSession } from "@/api/client";
import { humanizeConstructId } from "@/components/checkin-question-card";
import { AppPage } from "@/components/ui/app-page";
import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import type { TabItem } from "@/components/ui/tabs";
import { env } from "@/env";

/* -------------------------------------------------------------------------------------------
 * Hand-typed contract — see the module docstring's "hand-typed" section above
 * ---------------------------------------------------------------------------------------- */

/* `construct_id` is deliberately a plain `string`, matching the contract (`NudgeResponse.
 * construct_id` in `@/api/generated`, typed `str` on the backend). It was briefly a five-member
 * union here, written before `/dashboard/actions` existed in `openapi.json` — which made this the
 * second hardcoded list of the check-in construct ids and tripped FT-P9-1
 * (`test_no_frontend_or_mobile_source_file_hardcodes_all_five_construct_ids`), whose whole point
 * is that "neither mobile nor dashboard carries a second list". Rendering goes through the shared
 * `humanizeConstructId`, which takes any id, so the union bought nothing it cost. */

/** The state machine agents.md §10.12 task 3 names: `draft -> pending -> approved -> sent`, with
 * `dismissed` reachable from `pending`. Only `pending` is actionable from this page — see the
 * module docstring's `Q-48` note. */
export type NudgeStatus = "draft" | "pending" | "approved" | "dismissed" | "sent";

/** One AI-drafted nudge, exactly as `GET /dashboard/actions` and the two `POST .../{id}/...`
 * mutation endpoints describe an element — the firm response shape this task was built against
 * (see the module docstring). */
export interface Nudge {
  readonly id: string;
  readonly site_id: string;
  readonly site_name: string;
  readonly construct_id: string;
  readonly triggering_signal_summary: string;
  readonly status: NudgeStatus;
  readonly drafted_title: string;
  readonly drafted_body: string;
  readonly created_at: string;
  readonly approved_at: string | null;
  readonly sent_at: string | null;
  readonly dismissed_at: string | null;
}

/* `GET /dashboard/actions` answers with a **bare array** of nudges, not an `{ nudges: [...] }`
 * envelope — confirmed against `openapi.json` (`"type": "array"`, items `NudgeResponse`). This
 * file originally declared the envelope, written against a provisional shape before the route
 * existed in the contract; the page threw `nudges is not iterable` on first render and the whole
 * Actions screen was blank in production. Do not reintroduce a wrapper without changing the
 * backend's own response model first. */

/* -------------------------------------------------------------------------------------------
 * The hand-rolled request helper — same shape `kb-upload-flow.tsx`'s `postJson` and
 * `roster-upload-flow.tsx`'s `previewRoster` already use for a route `apiRequest` cannot type yet
 * ---------------------------------------------------------------------------------------- */

const API_ROOT = env.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

interface ErrorEnvelopeLike {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelopeLike {
  if (typeof value !== "object" || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}

/** Both routes this page calls take no request body (`GET /dashboard/actions`, and the two
 * `POST .../{id}/{approve,dismiss}` mutations per this task's own firm spec: "no request body,
 * response echoes the updated nudge object") — so unlike `kb-upload-flow.tsx`'s `postJson`, this
 * helper never sends one. Same `ApiError`/envelope handling as `src/api/client.ts`'s real
 * `apiRequest` throughout, so a caller here has exactly the one failure shape every other page
 * already knows how to render. */
async function request<TResponse>(method: "GET" | "POST", path: string): Promise<TResponse> {
  const session = getSession();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (session !== null) {
    headers.Authorization = `Bearer ${session.tokens.access_token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
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
    return (await response.json()) as TResponse;
  } catch {
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.responseNotUnderstood,
      message: "The server responded with a body this client does not understand.",
    });
  }
}

function fetchNudges(): Promise<readonly Nudge[]> {
  return request<readonly Nudge[]>("GET", "/dashboard/actions");
}

function approveNudge(id: string): Promise<Nudge> {
  return request<Nudge>("POST", `/dashboard/actions/${id}/approve`);
}

function dismissNudge(id: string): Promise<Nudge> {
  return request<Nudge>("POST", `/dashboard/actions/${id}/dismiss`);
}

/* -------------------------------------------------------------------------------------------
 * Page-level load state and error messages — same pattern as `signals/page.tsx`
 * ---------------------------------------------------------------------------------------- */

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly nudges: readonly Nudge[] };

const GENERIC_FAILURE = "Could not load Actions. Try again in a moment.";
const FORBIDDEN_MESSAGE =
  "You do not have access to this page. Actions is visible to HR admins and org owners only.";

function messageFor(error: unknown, fallback: string = GENERIC_FAILURE): string {
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
    return error.message || fallback;
  }
  return fallback;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** The one caption line each card shows, keyed to whichever timestamp is meaningful for its
 * current status. Falls back to `created_at` — every nudge has one — for the two statuses
 * (`draft`, `pending`) with no status-specific timestamp of their own yet. */
function dateCaptionFor(nudge: Nudge): string {
  switch (nudge.status) {
    case "approved":
      return nudge.approved_at !== null
        ? `Approved ${formatDateTime(nudge.approved_at)}`
        : `Drafted ${formatDateTime(nudge.created_at)}`;
    case "sent":
      return nudge.sent_at !== null
        ? `Sent ${formatDateTime(nudge.sent_at)}`
        : `Drafted ${formatDateTime(nudge.created_at)}`;
    case "dismissed":
      return nudge.dismissed_at !== null
        ? `Dismissed ${formatDateTime(nudge.dismissed_at)}`
        : `Drafted ${formatDateTime(nudge.created_at)}`;
    default:
      return `Drafted ${formatDateTime(nudge.created_at)}`;
  }
}

/* -------------------------------------------------------------------------------------------
 * Status badge — a plain pill, not `TrafficLightMeter`
 * ---------------------------------------------------------------------------------------- */

/**
 * Why this is its own small badge rather than reusing `TrafficLightMeter`/`SuppressedNotice`
 * (agents.md §5.5's "colour is never the only signal" still applies, just not through that
 * component): `TrafficLightMeter` renders a three-band *measurement* — green/amber/red against a
 * validated-placeholder threshold, with a suppression state for a too-small cohort. A nudge's
 * `status` is a five-state *workflow* position, not a measurement, and it is never suppressed —
 * min-N has nothing to do with whether a nudge has been approved. Force-fitting `band`/
 * `suppressed`/`status_label` onto `draft`/`pending`/`approved`/`dismissed`/`sent` would mean
 * inventing a fake bands mapping for a five-state enum a three-band component was never shaped
 * for. `kb-document-card.tsx`'s `StatusBadge` (a filled pill, coloured by a `STATUS_TONE` lookup,
 * with the label text always present — never colour alone) is the actual right-shaped precedent
 * here: a workflow status pill, not a measurement dot. This is that same idiom, reimplemented for
 * `NudgeStatus` rather than `KbDocumentStatus`, the same way `checkin-question-card.tsx`'s own
 * `QuestionTypeBadge` reimplements it for `CheckinQuestionType` instead of importing a badge typed
 * for a different enum.
 */
/** Which status deserves which pill. Domain knowledge, so it stays here rather than in `Badge`. */
const STATUS_TONE: Readonly<Record<NudgeStatus, BadgeTone>> = {
  draft: "neutral",
  pending: "attention",
  approved: "positive",
  sent: "positive",
  dismissed: "neutral",
};

const STATUS_LABEL: Readonly<Record<NudgeStatus, string>> = {
  draft: "Drafting",
  pending: "Needs review",
  approved: "Approved",
  sent: "Sent",
  dismissed: "Dismissed",
};

function NudgeStatusBadge({ status }: { readonly status: NudgeStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} className="shrink-0">
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/* -------------------------------------------------------------------------------------------
 * Approve / Dismiss — per-card mutation state
 * ---------------------------------------------------------------------------------------- */

type NudgeAction = "approve" | "dismiss";

type ActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly action: NudgeAction }
  | { readonly kind: "error"; readonly action: NudgeAction; readonly message: string };

const IDLE_ACTION_STATE: ActionState = { kind: "idle" };

/**
 * Approve is the primary action; Dismiss is secondary. A nudge that is dismissed is a normal,
 * non-destructive outcome of review, not an error, so Dismiss is deliberately NOT the
 * `destructive` variant — but it is irreversible (there is no un-dismiss transition in the state
 * machine), which is why it goes through a confirmation dialog while Approve does not.
 */
interface NudgeCardProps {
  readonly nudge: Nudge;
  readonly actionState: ActionState;
  readonly onApprove: () => void;
  readonly onDismiss: () => void;
}

function NudgeCard({ nudge, actionState, onApprove, onDismiss }: NudgeCardProps) {
  const working = actionState.kind === "working";
  const constructLabel = humanizeConstructId(nudge.construct_id);

  return (
    <Card
      data-testid={`nudge-card-${nudge.id}`}
      data-status={nudge.status}
      className="flex flex-col gap-16"
    >
      <div className="flex flex-wrap items-start justify-between gap-12">
        <div className="flex min-w-[0] flex-col gap-4">
          {/* Site only — never a manager or an individual worker (Q-50 / Q-47, see module
           * docstring). `site_id` exists on the type but is never rendered: it is an internal
           * identifier, not something an HR admin needs to see next to the site's own name. */}
          <p className="truncate text-card-title font-extrabold text-text-primary">{nudge.site_name}</p>
          <p className="text-meta font-medium text-text-secondary">{constructLabel}</p>
        </div>
        <NudgeStatusBadge status={nudge.status} />
      </div>

      <p className="text-copy text-text-secondary">{nudge.triggering_signal_summary}</p>

      {/* The drafted nudge itself — plain text only, see the module docstring's "never an
       * individual worker's name" section. Neither field is parsed as markdown/HTML, and neither
       * is ever combined into a template string with any other field. */}
      <div className="flex flex-col gap-4 rounded-control bg-surface-warm-gray p-16">
        <p className="text-label font-bold text-text-primary">{nudge.drafted_title}</p>
        <p className="whitespace-pre-wrap text-copy text-text-primary">{nudge.drafted_body}</p>
      </div>

      <p className="text-meta text-text-tertiary">{dateCaptionFor(nudge)}</p>

      {nudge.status === "pending" ? (
        <div className="flex flex-col gap-8">
          {actionState.kind === "error" ? (
            <div
              role="alert"
              className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-12"
            >
              <p className="text-meta font-bold text-text-primary">
                Could not {actionState.action === "approve" ? "approve" : "dismiss"} this nudge.
              </p>
              <p className="text-meta text-text-primary">{actionState.message}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-12">
            <Button
              onClick={onApprove}
              disabled={working}
              loading={actionState.kind === "working" && actionState.action === "approve"}
              loadingLabel="Approving…"
            >
              Approve
            </Button>
            <Button variant="secondary" onClick={onDismiss} disabled={working}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * One nudge in the list beside the detail.
 *
 * Deliberately three short lines and no body: the point of a list is to let someone pick, and a
 * list that shows the whole of each item is not a list, it is the stack this screen used to be.
 * The drafted title carries the meaning, the site says where, the date says how stale.
 *
 * A real `<button>` with `aria-current`, not a clickable row: it is keyboard-reachable, it says
 * which one is showing, and `aria-current` is the same word the rail uses for the same idea.
 */
function NudgeListRow({
  nudge,
  selected,
  onSelect,
}: {
  readonly nudge: Nudge;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={[
        "flex w-full min-w-[0] flex-col items-start gap-4 rounded-control px-16 py-12 text-left",
        "transition-colors duration-[var(--duration-fast)] ease-standard",
        "focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum",
        selected
          ? "bg-surface-plum-tint inset-shadow-plum-tint"
          : "bg-surface-card hover:bg-surface-warm-gray",
      ].join(" ")}
    >
      <span className="w-full truncate text-label font-bold text-text-primary">
        {nudge.drafted_title}
      </span>
      <span className="w-full truncate text-meta text-text-secondary">
        {nudge.site_name} · {humanizeConstructId(nudge.construct_id)}
      </span>
      <span className="w-full truncate text-meta text-text-tertiary">{dateCaptionFor(nudge)}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------------------------
 * Grouping — one tab per status, in workflow order
 * ---------------------------------------------------------------------------------------- */

const STATUS_ORDER: readonly NudgeStatus[] = ["pending", "draft", "approved", "sent", "dismissed"];

/** Tab labels. Shorter than `SECTION_TITLE` because a tab is a label, not a sentence. */
const TAB_LABEL: Readonly<Record<NudgeStatus, string>> = {
  pending: "Needs review",
  draft: "Drafting",
  approved: "Approved",
  sent: "Sent",
  dismissed: "Dismissed",
};

/** What an empty tab says. Never "nothing here" — each of these is a different fact. */
const TAB_EMPTY: Readonly<Record<NudgeStatus, string>> = {
  pending: "Nothing is waiting on you right now.",
  draft: "Kayla is not drafting anything at the moment.",
  approved: "Nothing has been approved and not yet sent.",
  sent: "Nothing has been sent to a site yet.",
  dismissed: "Nothing has been dismissed.",
};

const SECTION_TITLE: Readonly<Record<NudgeStatus, string>> = {
  pending: "Needs your review",
  draft: "Drafting",
  approved: "Approved",
  sent: "Sent",
  dismissed: "Dismissed",
};

/** Only the two sections that are not entirely self-explanatory from their title plus each
 * card's own badge get a subtitle — matching `settings/page.tsx`'s `SectionCard` restraint about
 * when a subtitle earns its place. */
const SECTION_SUBTITLE: Partial<Readonly<Record<NudgeStatus, string>>> = {
  pending: "Review each AI-drafted nudge below, then approve or dismiss it.",
  draft: "Kayla is still drafting these from a recent adjustment signal — nothing to review yet.",
};

function groupByStatus(nudges: readonly Nudge[]): Readonly<Record<NudgeStatus, readonly Nudge[]>> {
  const groups: Record<NudgeStatus, Nudge[]> = {
    draft: [],
    pending: [],
    approved: [],
    sent: [],
    dismissed: [],
  };
  for (const nudge of nudges) {
    groups[nudge.status].push(nudge);
  }
  return groups;
}

/* -------------------------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------------------------- */

export default function ActionsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [actionStates, setActionStates] = useState<Readonly<Record<string, ActionState>>>({});
  /**
   * The nudge whose dismissal is waiting on a confirmation. `dismissed` is terminal in the state
   * machine (`draft -> pending -> approved -> sent`, with `dismissed` reachable only from
   * `pending`) — there is no transition back, so this is the one action on the page that is worth
   * a dialog. Approve is not: it is reversible in practice, because an approved nudge still has
   * to be sent.
   */
  const [pendingDismissal, setPendingDismissal] = useState<Nudge | null>(null);
  /**
   * Which status tab is showing, and which nudge in it is open.
   *
   * `pending` always opens first, even when it is empty. "Nothing is waiting on you" is the most
   * useful thing this screen can say, and landing on whichever tab happens to be non-empty would
   * mean the page showed you a different thing every visit.
   *
   * Local state, not the URL: `(dashboard)/__tests__/no-individual-care-usage.test.tsx` renders
   * every dashboard page with a `next/navigation` mock that has no `useSearchParams`.
   */
  const [tab, setTab] = useState<NudgeStatus>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Changing tab drops the pinned selection — see `selected` below for why it is pinned. */
  function selectTab(next: NudgeStatus) {
    setTab(next);
    setSelectedId(null);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchNudges();
        if (!cancelled) setState({ status: "loaded", nudges: data });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: messageFor(error) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** On-success update only, no optimistic flip — an approve/dismiss that fails leaves the card
   * exactly where it was, with an inline error next to its two buttons, rather than a card that
   * silently reverts state a moment after appearing to move. The response echoes the full updated
   * nudge (this task's own firm spec), so this always renders the server's own state, never a
   * client-guessed one. */
  async function handleAction(nudge: Nudge, action: NudgeAction) {
    // Pin it before the status changes. Approving or dismissing moves a nudge out of the tab it
    // is listed in, and the detail pane resolves against the whole set rather than the tab (see
    // `selected`), so pinning here is what keeps the thing you just acted on open in front of
    // you — with its new badge and no buttons — instead of silently disappearing. Without this,
    // a nudge that was showing only because it was first in the list would vanish on success and
    // leave no evidence the action landed.
    setSelectedId(nudge.id);
    setActionStates((current) => ({ ...current, [nudge.id]: { kind: "working", action } }));
    try {
      const updated = action === "approve" ? await approveNudge(nudge.id) : await dismissNudge(nudge.id);
      setState((current) =>
        current.status === "loaded"
          ? { status: "loaded", nudges: current.nudges.map((n) => (n.id === updated.id ? updated : n)) }
          : current,
      );
      setActionStates((current) => {
        const next = { ...current };
        delete next[nudge.id];
        return next;
      });
      setPendingDismissal(null);
    } catch (error) {
      const message = messageFor(
        error,
        action === "approve"
          ? "Could not approve this nudge. Try again in a moment."
          : "Could not dismiss this nudge. Try again in a moment.",
      );
      setActionStates((current) => ({ ...current, [nudge.id]: { kind: "error", action, message } }));
    }
  }

  const nudges = state.status === "loaded" ? state.nudges : [];
  const sections = groupByStatus(nudges);
  const inTab = sections[tab];
  /**
   * The nudge in the detail pane.
   *
   * Resolved against **every** nudge rather than only the ones in this tab, and that is the whole
   * of how approving and dismissing feel right. Acting on a nudge changes its status, so it
   * leaves the tab you are triaging in — but it stays open beside the list, now showing its new
   * badge and no buttons, so you can see that the thing you just did actually happened. The list
   * has already moved on to what is left.
   *
   * Switching tabs clears the id (see `selectTab`), so a nudge from another tab can never be the
   * one showing. With no id, the first in the tab opens: a triage screen should not make you
   * click once before it shows you anything.
   */
  const selected = nudges.find((nudge) => nudge.id === selectedId) ?? inTab[0] ?? null;

  const tabs: readonly TabItem<NudgeStatus>[] = STATUS_ORDER.map((status) => ({
    key: status,
    label: TAB_LABEL[status],
    count: sections[status].length,
  }));

  return (
    <AppPage
      header={
        <PageHeader
          eyebrow="Actions"
          title="Actions"
          description="AI-drafted nudges for a site’s leadership, generated from that site’s adjustment signals. Nothing is sent to anyone until you approve it here."
        />
      }
      tabs={
        nudges.length > 0 ? (
          <Tabs items={tabs} activeKey={tab} onChange={selectTab} label="Filter nudges by status" />
        ) : undefined
      }
    >
      {state.status === "loading" ? <PageSkeleton label="Loading Actions…" /> : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">Could not load Actions.</p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "loaded" ? (
        nudges.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheckGlyph />}
            title="Nothing to review"
            description="Kayla drafts a nudge on its own when a site’s adjustment signal moves into the amber or red band. Until then there is nothing waiting on you — this page filling up is a signal in itself."
          />
        ) : (
          <TabPanel tabKey={tab} activeKey={tab}>
            {inTab.length === 0 && selected === null ? (
              <EmptyState
                icon={<ClipboardCheckGlyph />}
                title={SECTION_TITLE[tab]}
                description={TAB_EMPTY[tab]}
              />
            ) : (
              /*
                List beside detail, rather than every nudge at full height one after another.

                A nudge's body is drafted prose of no fixed length, so five of them used to be
                five screens — and the approve/dismiss buttons, the only reason to be on this
                page, were at the bottom of each. Now the list is the whole of what there is to
                triage, and the one you pick is open beside it with its controls in view.
              */
              <div className="flex flex-col gap-16 lg:flex-row lg:items-start">
                <div className="flex flex-col gap-8 lg:w-[calc(var(--spacing-80)*5)] lg:shrink-0">
                  {SECTION_SUBTITLE[tab] === undefined ? null : (
                    <p className="text-copy text-text-secondary">{SECTION_SUBTITLE[tab]}</p>
                  )}
                  {inTab.length === 0 ? (
                    // Emptied by the action you just took, with that nudge still open beside
                    // this. A page-level empty state here would wipe out the thing you are
                    // looking at to tell you the list is short.
                    <p className="rounded-card border border-hairline-lilac bg-surface-card p-16 text-copy text-text-secondary">
                      {TAB_EMPTY[tab]}
                    </p>
                  ) : (
                    <ul
                      aria-label={`${SECTION_TITLE[tab]} nudges`}
                      className="flex list-none flex-col gap-4 rounded-card border border-hairline-lilac bg-surface-card p-8 shadow-elevation-card"
                    >
                      {inTab.map((nudge) => (
                        <li key={nudge.id}>
                          <NudgeListRow
                            nudge={nudge}
                            selected={selected !== null && nudge.id === selected.id}
                            onSelect={() => setSelectedId(nudge.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="min-w-[0] flex-1">
                  {selected === null ? null : (
                    <NudgeCard
                      key={selected.id}
                      nudge={selected}
                      actionState={actionStates[selected.id] ?? IDLE_ACTION_STATE}
                      onApprove={() => void handleAction(selected, "approve")}
                      onDismiss={() => setPendingDismissal(selected)}
                    />
                  )}
                </div>
              </div>
            )}
          </TabPanel>
        )
      ) : null}

      <Modal
        open={pendingDismissal !== null}
        onClose={() => setPendingDismissal(null)}
        title="Dismiss this nudge?"
        description={
          pendingDismissal === null
            ? undefined
            : `${pendingDismissal.drafted_title} — ${pendingDismissal.site_name}`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDismissal(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              loading={
                pendingDismissal !== null &&
                actionStates[pendingDismissal.id]?.kind === "working"
              }
              loadingLabel="Dismissing…"
              onClick={() => {
                if (pendingDismissal !== null) void handleAction(pendingDismissal, "dismiss");
              }}
            >
              Dismiss nudge
            </Button>
          </>
        }
      >
        <p className="text-copy text-text-secondary">
          Dismissing is final — there is no way back to &ldquo;needs review&rdquo; for this nudge,
          and nobody at the site is told either way. Kayla can still draft a new one if the
          signal moves again.
        </p>
      </Modal>
    </AppPage>
  );
}

/** `Icon.jsx`'s own `clipboard-check` — the same glyph the rail uses for this section. */
function ClipboardCheckGlyph() {
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
      <rect width={8} height={4} x={8} y={2} rx={1} ry={1} />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}
