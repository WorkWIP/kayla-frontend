"use client";

/**
 * The HR dashboard sign-in form (agents.md §10.1 task 7).
 *
 * --------------------------------------------------------------------------------------------
 * Why this form asks for an organisation it never shows a field for
 * --------------------------------------------------------------------------------------------
 * `POST /auth/login` requires `org_id`. That is not an oversight in the contract: `users` is under
 * `FORCE ROW LEVEL SECURITY` with no `BYPASSRLS` role anywhere (agents.md §6.2 layer 2), and
 * `users.email` is unique *per organisation* — the same person can be a worker at one customer and
 * an HR admin at another. With `app.current_org_id` unset the policy predicate is `org_id = NULL`
 * and every row is invisible, so no query the API can run turns an address alone into an account.
 *
 * The organisation is therefore client state, not something a person types
 * (`kayla.auth.schemas` module docstring). The dashboard learns it from its invitation link
 * (`/login?org=<uuid>`) and remembers it. When it has neither, this component says so plainly
 * instead of rendering a form that could only ever fail.
 *
 * --------------------------------------------------------------------------------------------
 * Accessibility (agents.md §5.6 — the design system ships none, so it is on us)
 * --------------------------------------------------------------------------------------------
 * Real `<label for>` elements · `aria-invalid` + `aria-describedby` on a field that failed ·
 * the failure region is `role="alert"` and takes focus so a keyboard user lands on the reason ·
 * a focus style that is never removed without a replacement · every control at least 44x44
 * (the design system's spacing scale steps 40 -> 48, so 48 it is) · native validation is off
 * (`noValidate`) because the browser's bubbles are neither announced reliably nor styleable, and
 * two competing sources of error copy is how one of them goes stale.
 *
 * --------------------------------------------------------------------------------------------
 * Error copy never says whether the account exists
 * --------------------------------------------------------------------------------------------
 * `RAG.md` §12.3. The backend already collapses "no such organisation", "no such address", "no
 * password set yet" and "wrong password" into one code, one message and one timing. This file must
 * not undo that by rendering different copy for codes that are meant to be indistinguishable, so
 * it maps *codes* to copy it owns, and falls back to one generic line for anything unrecognised.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest, clearSession, setSession } from "@/api/client";
import type { UserRole } from "@/api/client";

/**
 * Which surface each role signs in on, mirroring `kayla.auth.tokens.audience_for_role`.
 *
 * `satisfies Record<UserRole, Surface>` is the point of the declaration: `UserRole` comes from the
 * generated contract, so adding a seventh role to the backend enum breaks this build until someone
 * states which surface it belongs to. A deny-list (`role !== "worker"`) would have silently
 * admitted it.
 *
 * This is a courtesy, not the enforcement. Enforcement is agents.md §6.2 layer 1: the backend picks
 * the token's audience from the role, so a worker's token is structurally incapable of reaching a
 * dashboard route no matter what this file does.
 */
const ROLE_SURFACE = {
  worker: "worker",
  hr_admin: "dashboard",
  org_owner: "dashboard",
  /** §6.1: "Not a login in MVP" (`Q-50` open). The backend refuses to mint a token for it. */
  manager: "none",
  kayla_ops: "dashboard",
  superadmin: "dashboard",
} as const satisfies Record<UserRole, "worker" | "dashboard" | "none">;

/** Where a signed-in dashboard user lands. P4 replaces this with the real Overview route. */
const POST_LOGIN_DESTINATION = "/cohorts";

/** The invitation link's query parameter, and the key it is remembered under. */
const ORG_QUERY_PARAM = "org";
const ORG_STORAGE_KEY = "kayla.dashboard.org_id";

/**
 * Canonical 8-4-4-4-12 hex form, which is what the API's `format: uuid` accepts.
 * Validated here so a mistyped link fails on this side of the network with copy a person can act
 * on, rather than as a 422 that says nothing useful.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deliberately permissive: something, an `@`, something with a dot. Anything stricter rejects
 * addresses that are legal and deliverable, and the only authority on whether an address works is
 * the server. This exists to catch a typo before a network round trip, not to validate email.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `LoginRequest.email` is `maxLength: 320` in the contract. */
const EMAIL_MAX_LENGTH = 320;

/** `LoginRequest.password` is `maxLength: 1024`. The *minimum* is 1 — see `validate` below. */
const PASSWORD_MAX_LENGTH = 1024;

const COPY = {
  emailLabel: "Work email",
  passwordLabel: "Password",
  submit: "Sign in",
  submitting: "Signing in…",
  emailRequired: "Enter your work email address.",
  emailMalformed: "That does not look like an email address.",
  passwordRequired: "Enter your password.",
  failureLead: "Sign-in failed.",
  /**
   * One line for every cause the server refuses to distinguish. Changing this to anything that
   * varies by cause reintroduces the account-existence oracle `RAG.md` §12.3 closes.
   */
  invalidCredentials: "That email address and password do not match.",
  accountLocked:
    "Too many sign-in attempts, so this account is closed for a short while. Wait a few minutes and try again.",
  rateLimited: "Too many attempts from this device. Wait a moment, then try again.",
  validation: "Check the email address and password, then try again.",
  unavailable: "Kayla is not reachable right now. Try again in a moment.",
  unexpected: "Something went wrong signing in. Try again.",
  wrongSurface:
    "This account signs in on the Kayla app for workers, not on the HR dashboard. Open Kayla on your phone.",
  notALogin: "This account cannot sign in. Ask your administrator to set one up for you.",
} as const;

/** Copy by §8.2 `error.code`. Anything absent falls back to `COPY.unexpected`. */
const FAILURE_COPY: Readonly<Record<string, string>> = {
  invalid_credentials: COPY.invalidCredentials,
  account_locked: COPY.accountLocked,
  rate_limited: COPY.rateLimited,
  validation_error: COPY.validation,
  service_unavailable: COPY.unavailable,
  tenant_scope_unavailable: COPY.unavailable,
  auth_misconfigured: COPY.notALogin,
  [CLIENT_ERROR_CODES.networkUnreachable]: COPY.unavailable,
  [CLIENT_ERROR_CODES.responseNotUnderstood]: COPY.unavailable,
};

function messageFor(failure: unknown): string {
  if (failure instanceof ApiError) {
    return FAILURE_COPY[failure.code] ?? COPY.unexpected;
  }
  return COPY.unexpected;
}

/**
 * Reads the organisation from the invitation link, falling back to the one last used here.
 * Pure: persisting is a separate effect, because a render may run twice and must not write.
 */
function readOrgId(fromQuery: string | null): string | null {
  if (fromQuery !== null && UUID_PATTERN.test(fromQuery)) return fromQuery;

  const remembered = recall();
  return remembered !== null && UUID_PATTERN.test(remembered) ? remembered : null;
}

/**
 * The organisation id is *not* a credential: it is in the invitation URL, it grants nothing, and a
 * wrong one makes the login query match fewer rows rather than more. Keeping it in `localStorage`
 * is therefore a different decision from keeping a token there, which this app never does — see
 * the `SESSION` comment in `src/api/client.ts`.
 *
 * Storage can throw outright (Safari private browsing, a blocked-cookies policy), so both halves
 * degrade to "we do not know the organisation", which this component already renders.
 */
function remember(orgId: string): void {
  try {
    window.localStorage.setItem(ORG_STORAGE_KEY, orgId);
  } catch {
    // Not knowing it next time is a worse sign-in, not a broken one.
  }
}

function recall(): string | null {
  try {
    return window.localStorage.getItem(ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};

  const trimmed = email.trim();
  if (trimmed === "") {
    errors.email = COPY.emailRequired;
  } else if (!EMAIL_PATTERN.test(trimmed)) {
    errors.email = COPY.emailMalformed;
  }

  // Emptiness only. Never the password *policy* (NIST SP 800-63B, 12 characters) — that belongs on
  // the screens that set a password. Enforcing it at sign-in would lock out any account whose
  // password predates the current rule and would tell an attacker what the rule is.
  if (password === "") {
    errors.password = COPY.passwordRequired;
  }

  return errors;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolved once per mount. Holding it in state rather than recomputing keeps the form stable if
  // the query string changes underneath a half-typed sign-in.
  const [orgId] = useState(() => readOrgId(searchParams.get(ORG_QUERY_PARAM)));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);

  const formId = useId();
  const emailId = `${formId}-email`;
  const passwordId = `${formId}-password`;
  const emailErrorId = `${emailId}-error`;
  const passwordErrorId = `${passwordId}-error`;
  const noticeId = `${formId}-notice`;

  // Carry the organisation forward, so the next visit to /login works without the invitation link.
  useEffect(() => {
    if (orgId !== null) remember(orgId);
  }, [orgId]);

  // `role="alert"` announces the failure; moving focus into it is what puts a keyboard user *at*
  // the reason rather than back at the top of the form with an announcement they cannot re-read.
  useEffect(() => {
    if (failure !== null) failureRef.current?.focus();
  }, [failure]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || orgId === null) return;

    setFailure(null);

    const errors = validate(email, password);
    setFieldErrors(errors);
    if (errors.email !== undefined) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password !== undefined) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const session = await apiRequest("post", "/auth/login", {
        body: { org_id: orgId, email: email.trim(), password },
      });

      const surface = ROLE_SURFACE[session.user.role];
      if (surface !== "dashboard") {
        // The credential is valid; it is simply not for this application. Hold nothing: a token
        // this app must never send is a token it must never keep.
        clearSession();
        setFailure(surface === "worker" ? COPY.wrongSurface : COPY.notALogin);
        return;
      }

      setSession(session);
      router.replace(POST_LOGIN_DESTINATION);
    } catch (error) {
      setFailure(messageFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  // No organisation, no form. A sign-in that cannot succeed is worse than an explanation, and
  // there is no field to offer instead: the organisation is not something a person types.
  if (orgId === null) {
    // Not `role="alert"`: this is here on first paint, and a live region only announces what
    // *changes*. A labelled section with a real heading is what a screen reader actually reads.
    return (
      <section
        aria-labelledby={noticeId}
        className="flex flex-col gap-12 rounded-card bg-surface-plum-tint p-24 inset-shadow-plum-tint"
      >
        <h2 id={noticeId} className="text-title text-text-primary">
          We do not know which organisation you work for
        </h2>
        <p className="text-body text-text-secondary">
          Open the sign-in link Kayla emailed you — it carries your organisation with it. Your
          administrator can send it again.
        </p>
      </section>
    );
  }

  return (
    <form
      noValidate
      aria-busy={submitting}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-24 rounded-card-lg bg-surface-card p-32 shadow-elevation-card"
    >
      {failure !== null ? (
        <div
          ref={failureRef}
          role="alert"
          tabIndex={-1}
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16 focus:outline-hidden focus:inset-shadow-focus-plum"
        >
          {/* The lead-in is the non-colour half of the signal (agents.md §5.5: colour is never
              the only signal), and the body text is near-black rather than persimmon because
              persimmon-500 on its own subtle fill does not reach 4.5:1. */}
          <p className="text-label font-bold text-text-primary">{COPY.failureLead}</p>
          <p className="text-copy text-text-primary">{failure}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        <label htmlFor={emailId} className="text-field-label font-bold text-text-primary">
          {COPY.emailLabel}
        </label>
        <input
          ref={emailRef}
          id={emailId}
          name="email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          maxLength={EMAIL_MAX_LENGTH}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-required="true"
          aria-invalid={fieldErrors.email !== undefined}
          aria-describedby={fieldErrors.email !== undefined ? emailErrorId : undefined}
          className="min-h-48 w-full rounded-control border border-lilac-400 bg-surface-card px-16 text-body text-text-primary focus-visible:border-border-focus focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum"
        />
        {fieldErrors.email !== undefined ? (
          // role="alert" (not aria-live="polite"): this element does not exist on first paint —
          // it is inserted as a direct consequence of a failed submit, often while the input it
          // describes already has focus (Enter from an empty required field). A live region only
          // announces a change to content already in the accessibility tree; freshly-mounted
          // content needs an *implicit* live region, which role="alert" provides regardless of
          // whether anything's focus actually moved. Matches the server-error region below.
          <p id={emailErrorId} role="alert" className="text-copy text-text-primary">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-8">
        <label htmlFor={passwordId} className="text-field-label font-bold text-text-primary">
          {COPY.passwordLabel}
        </label>
        <input
          ref={passwordRef}
          id={passwordId}
          name="password"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="current-password"
          required
          aria-required="true"
          aria-invalid={fieldErrors.password !== undefined}
          aria-describedby={fieldErrors.password !== undefined ? passwordErrorId : undefined}
          className="min-h-48 w-full rounded-control border border-lilac-400 bg-surface-card px-16 text-body text-text-primary focus-visible:border-border-focus focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum"
        />
        {fieldErrors.password !== undefined ? (
          // See the email field's error <p> above for why role="alert" and not aria-live.
          <p id={passwordErrorId} role="alert" className="text-copy text-text-primary">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="min-h-48 w-full rounded-control bg-action-primary px-24 text-label font-bold text-text-inverse transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-action-primary-hover focus-visible:outline-hidden focus-visible:inset-shadow-focus-mint disabled:bg-action-disabled disabled:text-text-secondary"
      >
        {submitting ? COPY.submitting : COPY.submit}
      </button>
    </form>
  );
}
