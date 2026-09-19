"use client";

/**
 * `/settings` — the Settings dashboard (agents.md §10.11 task 10).
 *
 * --------------------------------------------------------------------------------------------
 * The four sections, one endpoint each, all `org_owner`-only
 * --------------------------------------------------------------------------------------------
 * `kayla.org_settings.router` (a sibling task in this same phase, read directly before writing
 * this file) gates every one of these four routes to `require_role(UserRole.ORG_OWNER)` —
 * deliberately **not** `hr_admin`, agents.md §6.1's own role table. There is no partial view of
 * this page for an HR admin: all four requests 403 identically for that role, so this file does
 * not attempt them for a non-`org_owner` session at all (see "Role gating" below) rather than
 * rendering four stacked failure alerts for a state that is entirely predictable in advance.
 *
 * 1. `GET`/`PATCH /dashboard/settings` — the min-N suppression floor and the two traffic-light
 *    cutoffs Signals reads (agents.md §10.11 tasks 2/4), plus the proactive-Care low-mood count
 *    (task 9, configurable threshold). An org that never wrote a row gets the spec defaults back
 *    (`has_custom_settings: false`), never a 404 — this page shows that distinction rather than
 *    hiding it.
 * 2. `GET /dashboard/settings/admin-users` — who holds `hr_admin`/`org_owner` in this org.
 *    Read-only; there is no invite/remove endpoint yet (`kayla.org_settings.router`'s own
 *    docstring: "no account-management write surface exists yet — this phase only asks for the
 *    listing"), so this section has no write affordance either, for the identical reason
 *    `check-in-questions/page.tsx` ships no toggle against an endpoint that does not exist.
 * 3. `GET /dashboard/settings/privacy-disclosure` — the min-N privacy guarantee, worded
 *    server-side with this org's *actual* `min_n_threshold` already filled in. Rendered
 *    verbatim, never rebuilt from the number on this page, so the two can never disagree.
 * 4. `GET /dashboard/settings/cost-of-turnover` — `Q-52`'s reference card. **Fixed content only**
 *    — agents.md §13.1/§13.5 trap 1 is explicit that the old interactive calculator page is cut;
 *    this section has no input fields and computes nothing from anything the org reports. The
 *    backend's own docstring says the same: "no request body, no computed answer over live
 *    data."
 *
 * --------------------------------------------------------------------------------------------
 * Role gating — the trivial check this task asks for, and no more
 * --------------------------------------------------------------------------------------------
 * `getSession()` already exposes `user.role` (the same field `sidebar-nav.tsx` and
 * `dashboard-shell.tsx` read). Checking it before firing four requests that would otherwise all
 * 403 together is a one-line read of state this file already has for free — not new
 * infrastructure. The backend remains the real enforcement layer regardless (agents.md §6.2):
 * this check only decides what a non-`org_owner` sees while waiting on a network round trip they
 * cannot succeed at, and a 403 that arrives anyway (a stale local session, a role changed
 * server-side mid-visit) still falls through to the ordinary error alert below.
 *
 * --------------------------------------------------------------------------------------------
 * Fetch pattern and i18n
 * --------------------------------------------------------------------------------------------
 * A client component for the same reason `/cohorts` and `/signals` are (`src/api/client.ts`'s
 * session lives in memory only; `DashboardShell` has already confirmed a session before this
 * page mounts). All four Settings routes are already in `kayla-backend/openapi.json` as of this
 * writing, so `npm run codegen` was re-run before this file was written and it reads
 * `src/api/generated.ts` directly.
 *
 * i18n: no `next-intl` install and no `messages/{en,es}.json` pair exist in this repo yet — see
 * `check-in-questions/page.tsx`'s docstring and `signals/page.tsx`'s (this same task). This file
 * follows the same on-disk convention: plain English JSX text.
 */

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest, getSession } from "@/api/client";
import type { components } from "@/api/generated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";

type OrgSettingsResponse = components["schemas"]["OrgSettingsResponse"];
type OrgSettingsUpdateRequest = components["schemas"]["OrgSettingsUpdateRequest"];
type AdminUserSummary = components["schemas"]["AdminUserSummary"];
type PrivacyDisclosureResponse = components["schemas"]["PrivacyDisclosureResponse"];
type CostOfTurnoverReferenceCard = components["schemas"]["CostOfTurnoverReferenceCard"];

interface SettingsData {
  readonly settings: OrgSettingsResponse;
  readonly adminUsers: readonly AdminUserSummary[];
  readonly privacyDisclosure: PrivacyDisclosureResponse;
  readonly costOfTurnover: CostOfTurnoverReferenceCard;
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly data: SettingsData };

const GENERIC_FAILURE = "Could not load Settings. Try again in a moment.";
// Matches `(dashboard)/page.tsx` and `engagement/page.tsx`'s own `FORBIDDEN_MESSAGE` handling —
// belt-and-suspenders alongside the `isOrgOwner` check below: a role that changes server-side
// mid-visit, or a stale local session, still lands here rather than a raw backend sentence.
const FORBIDDEN_MESSAGE =
  "You do not have access to this page. Settings is visible to org owners only.";

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

function SectionCard({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}) {
  return (
    <Card as="section" className="flex flex-col gap-16">
      <div className="flex flex-col gap-4">
        <h2 className="text-card-title font-extrabold text-text-primary">{title}</h2>
        {subtitle ? <p className="text-copy text-text-secondary">{subtitle}</p> : null}
      </div>
      {children}
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------
 * 1. Thresholds & min-N
 * ---------------------------------------------------------------------------------------- */

/** The four editable fields, as the strings a controlled `<input type="number">` actually holds
 * while typing — parsed only at submit time, never mid-keystroke, so "12" being typed as "1" then
 * "12" never flashes a spurious validation error. */
interface ThresholdsDraft {
  readonly min_n_threshold: string;
  readonly signal_threshold_green: string;
  readonly signal_threshold_amber: string;
  readonly proactive_care_low_mood_count: string;
}

function draftFrom(settings: OrgSettingsResponse): ThresholdsDraft {
  return {
    min_n_threshold: String(settings.min_n_threshold),
    signal_threshold_green: String(settings.signal_threshold_green),
    signal_threshold_amber: String(settings.signal_threshold_amber),
    proactive_care_low_mood_count: String(settings.proactive_care_low_mood_count),
  };
}

/** `null` for an unparseable or non-finite value — the caller treats that as "do not include
 * this field in the patch, and block submit until it's fixed." */
function parseField(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Field bounds mirror `kayla.org_settings.models` (agents.md §10.11 task 10's own report:
 * `MIN_N_THRESHOLD_MIN/MAX`, `SIGNAL_THRESHOLD_MIN/MAX`, `PROACTIVE_CARE_LOW_MOOD_COUNT_MIN/MAX`)
 * — `<input min max>` attributes are a UX nicety only. The server re-validates every one of
 * these, including the cross-field green > amber rule this table cannot express, and its 422 is
 * what this form actually trusts (see `handleSubmit` below). */
const FIELD_BOUNDS = {
  min_n_threshold: { min: 1, max: 1000 },
  signal_threshold_green: { min: 0, max: 100 },
  signal_threshold_amber: { min: 0, max: 100 },
  proactive_care_low_mood_count: { min: 1, max: 100 },
} as const;

const FIELD_LABEL: Record<keyof ThresholdsDraft, string> = {
  min_n_threshold: "Minimum respondents to report a rate (min-N)",
  signal_threshold_green: "Green cutoff (on track)",
  signal_threshold_amber: "Amber cutoff (watch)",
  proactive_care_low_mood_count: "Low-mood check-ins before a proactive Care suggestion",
};

function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "Never customised — using the default values";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `Last updated ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}

type SaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | { readonly status: "saved" }
  | { readonly status: "error"; readonly message: string; readonly fields: readonly string[] };

function ThresholdsSection({
  settings,
  onSaved,
}: {
  readonly settings: OrgSettingsResponse;
  readonly onSaved: (next: OrgSettingsResponse) => void;
}) {
  const [draft, setDraft] = useState<ThresholdsDraft>(() => draftFrom(settings));
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  // "Adjusting state when a prop changes" (react.dev), not an effect: a fresh `settings` object
  // (e.g. a save round-tripping a new `updated_at`) resets the draft so it never shows a value
  // the server has already superseded. Tracked by reference, not deep equality — `onSaved` below
  // and the initial load each construct a genuinely new `OrgSettingsResponse` object, so identity
  // is exactly the right signal for "this is new data," and setting state mid-render here (rather
  // than in a `useEffect`) avoids the extra render pass an effect-based reset would cost.
  const [syncedSettings, setSyncedSettings] = useState(settings);
  if (settings !== syncedSettings) {
    setSyncedSettings(settings);
    setDraft(draftFrom(settings));
  }

  const parsed: Record<keyof ThresholdsDraft, number | null> = {
    min_n_threshold: parseField(draft.min_n_threshold),
    signal_threshold_green: parseField(draft.signal_threshold_green),
    signal_threshold_amber: parseField(draft.signal_threshold_amber),
    proactive_care_low_mood_count: parseField(draft.proactive_care_low_mood_count),
  };

  const invalidFields = (Object.keys(FIELD_BOUNDS) as Array<keyof ThresholdsDraft>).filter((key) => {
    const value = parsed[key];
    if (value === null) return true;
    const { min, max } = FIELD_BOUNDS[key];
    return value < min || value > max;
  });

  const changed = (Object.keys(FIELD_BOUNDS) as Array<keyof ThresholdsDraft>).filter(
    (key) => parsed[key] !== null && parsed[key] !== settings[key],
  );

  // The draft always holds all four fields (not just the ones this edit touches), so unlike the
  // server's `PATCH` handler — which only sees the fields actually sent and has to re-merge
  // against the stored row — this form can check the cross-field rule against the full picture
  // right here. This is a UX nicety only: the server re-validates the merged result regardless
  // (`invalid_org_settings`, `kayla.org_settings.service.OrgSettingsService.update`) and that
  // check is what this form actually trusts if the two ever disagree.
  const crossFieldInvalid =
    parsed.signal_threshold_amber !== null &&
    parsed.signal_threshold_green !== null &&
    parsed.signal_threshold_amber >= parsed.signal_threshold_green;

  const canSubmit =
    invalidFields.length === 0 && !crossFieldInvalid && changed.length > 0 && saveState.status !== "saving";

  function handleChange(field: keyof ThresholdsDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (saveState.status !== "idle") setSaveState({ status: "idle" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const body: OrgSettingsUpdateRequest = {};
    for (const key of changed) {
      body[key] = parsed[key] as number;
    }

    setSaveState({ status: "saving" });
    try {
      const next = await apiRequest("patch", "/dashboard/settings", { body });
      onSaved(next);
      setSaveState({ status: "saved" });
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = Array.isArray(error.details.fields)
          ? (error.details.fields as Array<{ location?: string; message?: string }>).map(
              (f) => `${f.location ?? "field"}: ${f.message ?? ""}`,
            )
          : [];
        setSaveState({ status: "error", message: messageFor(error), fields });
        return;
      }
      setSaveState({ status: "error", message: GENERIC_FAILURE, fields: [] });
    }
  }

  return (
    <SectionCard
      title="Thresholds & minimum respondents"
      subtitle="These cutoffs are unvalidated placeholders (agents.md §10.11 task 4) — changing them here changes what Signals and Overview report for this organisation."
    >
      <div className="flex flex-wrap items-center gap-8">
        <Badge tone={settings.has_custom_settings ? "positive" : "neutral"}>
          {settings.has_custom_settings ? "Custom settings" : "Using defaults"}
        </Badge>
        <span className="text-meta text-text-tertiary">{formatUpdatedAt(settings.updated_at)}</span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-16" noValidate>
        <div className="grid grid-cols-1 gap-16 sm:grid-cols-2">
          {(Object.keys(FIELD_BOUNDS) as Array<keyof ThresholdsDraft>).map((field) => {
            const bounds = FIELD_BOUNDS[field];
            const invalid = invalidFields.includes(field);
            return (
              <NumberField
                key={field}
                id={`settings-${field}`}
                label={FIELD_LABEL[field]}
                value={draft[field]}
                onValueChange={(value) => handleChange(field, value)}
                min={bounds.min}
                max={bounds.max}
                error={
                  invalid
                    ? `Enter a whole number between ${bounds.min} and ${bounds.max}.`
                    : undefined
                }
              />
            );
          })}
        </div>

        {crossFieldInvalid ? (
          <p role="alert" className="text-meta font-medium text-status-critical">
            The amber cutoff must be lower than the green cutoff.
          </p>
        ) : null}

        {saveState.status === "error" ? (
          <div role="alert" className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16">
            <p className="text-label font-bold text-text-primary">Could not save Settings.</p>
            <p className="text-copy text-text-primary">{saveState.message}</p>
            {saveState.fields.length > 0 ? (
              <ul className="list-disc pl-20 text-copy text-text-primary">
                {saveState.fields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-12">
          <Button
            type="submit"
            disabled={!canSubmit}
            loading={saveState.status === "saving"}
            loadingLabel="Saving…"
          >
            Save changes
          </Button>
          {saveState.status === "saved" ? (
            <span role="status" className="text-label font-bold text-status-positive">
              Saved.
            </span>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------------------------
 * 2. Admin users
 * ---------------------------------------------------------------------------------------- */

const ADMIN_ROLE_LABEL: Record<AdminUserSummary["role"], string> = {
  hr_admin: "HR Admin",
  org_owner: "Org Owner",
  worker: "Worker",
  manager: "Manager",
  kayla_ops: "Kayla Ops",
  superadmin: "Superadmin",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never signed in";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function AdminUsersSection({ users }: { readonly users: readonly AdminUserSummary[] }) {
  return (
    <SectionCard
      title="Admin users"
      subtitle="Everyone who can sign in to this dashboard as an HR admin or org owner."
    >
      {users.length === 0 ? (
        <EmptyState
          title="No admin users found"
          description="Nobody in this organisation can sign in to the dashboard yet. Kayla Ops adds the first org owner; that person invites everyone else."
        />
      ) : (
        <div className="flex flex-col divide-y divide-hairline-lilac">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-8 py-12">
              <div className="flex flex-col gap-4">
                <span className="text-label font-bold text-text-primary">{user.email}</span>
                <span className="text-meta text-text-tertiary">
                  {user.email_verified ? "Verified" : "Not verified"} · {formatDate(user.last_login_at)}
                </span>
              </div>
              <Badge tone="accent">{ADMIN_ROLE_LABEL[user.role]}</Badge>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------------------------
 * 3. Privacy disclosure
 * ---------------------------------------------------------------------------------------- */

function PrivacyDisclosureSection({ disclosure }: { readonly disclosure: PrivacyDisclosureResponse }) {
  return (
    <SectionCard title="Privacy disclosure">
      {/* Server-rendered copy, agents.md §10.11 task 10 — never rebuilt from min_n_threshold on
       * this page, so it can never disagree with the number the Thresholds section shows. */}
      <p className="text-body text-text-primary">{disclosure.text}</p>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------------------------
 * 4. Cost-of-turnover reference card — static content only, no calculator (agents.md §13.5 trap 1)
 * ---------------------------------------------------------------------------------------- */

function usd(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

function CostOfTurnoverSection({ card }: { readonly card: CostOfTurnoverReferenceCard }) {
  const example = card.example;
  const stats: ReadonlyArray<{ readonly label: string; readonly value: string }> = [
    { label: "New hires per year", value: String(example.new_hires_per_year) },
    { label: "Average replacement cost", value: usd(example.average_replacement_cost_usd) },
    { label: "First-90-day turnover rate", value: `${example.first_90_day_turnover_rate_percent}%` },
    { label: "Estimated reduction", value: `${example.estimated_reduction_percent}%` },
    { label: "Additional hires retained", value: String(example.additional_hires_retained) },
    { label: "Estimated annual savings", value: usd(example.estimated_annual_savings_usd) },
  ];

  return (
    <SectionCard title={card.title} subtitle={card.description}>
      <p className="text-copy font-medium text-text-secondary">{card.formula}</p>
      <div className="grid grid-cols-2 gap-12 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-4 rounded-control bg-surface-warm-gray p-12">
            <span className="text-title font-extrabold text-text-primary">{stat.value}</span>
            <span className="text-meta text-text-secondary">{stat.label}</span>
          </div>
        ))}
      </div>
      <p className="text-meta text-text-tertiary">{card.disclaimer}</p>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------------------------- */

export default function SettingsPage() {
  const session = getSession();
  const isOrgOwner = session?.user.role === "org_owner";

  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!isOrgOwner) return;

    let cancelled = false;

    async function load() {
      try {
        const [settings, adminUsers, privacyDisclosure, costOfTurnover] = await Promise.all([
          apiRequest("get", "/dashboard/settings", {}),
          apiRequest("get", "/dashboard/settings/admin-users", {}),
          apiRequest("get", "/dashboard/settings/privacy-disclosure", {}),
          apiRequest("get", "/dashboard/settings/cost-of-turnover", {}),
        ]);
        if (!cancelled) {
          setState({ status: "loaded", data: { settings, adminUsers, privacyDisclosure, costOfTurnover } });
        }
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: messageFor(error) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // `isOrgOwner` is derived from a session that only ever changes via a full sign-in/sign-out,
    // both of which remount this route — an empty-ish dependency list here does not risk missing
    // a role change mid-visit.
  }, [isOrgOwner]);

  if (!isOrgOwner) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-24 p-32">
        <PageHeader eyebrow="Settings" title="Settings" />
        <div className="flex flex-col gap-4 rounded-card border border-hairline-lilac bg-surface-warm-gray p-16">
          <p className="text-label font-bold text-text-primary">Org owners only.</p>
          <p className="text-copy text-text-secondary">
            Settings — thresholds, admin users, privacy disclosures, and the cost-of-turnover
            reference — are visible only to an organisation owner (agents.md §6.1). Ask an org
            owner on your team for a change here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-24 p-32">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Thresholds, admin users, the privacy disclosure workers see, and the cost-of-turnover reference card."
      />

      {state.status === "loading" ? (
        <PageSkeleton label="Loading Settings…" shape="form" count={4} />
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16">
          <p className="text-label font-bold text-text-primary">Could not load Settings.</p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "loaded" ? (
        <>
          <ThresholdsSection
            settings={state.data.settings}
            onSaved={(next) =>
              setState((current) =>
                current.status === "loaded"
                  ? { status: "loaded", data: { ...current.data, settings: next } }
                  : current,
              )
            }
          />
          <AdminUsersSection users={state.data.adminUsers} />
          <PrivacyDisclosureSection disclosure={state.data.privacyDisclosure} />
          <CostOfTurnoverSection card={state.data.costOfTurnover} />
        </>
      ) : null}
    </div>
  );
}
