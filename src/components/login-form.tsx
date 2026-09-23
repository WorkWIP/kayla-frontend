"use client";

/**
 * The HR dashboard sign-in form (agents.md §10.1 task 7).
 *
 * --------------------------------------------------------------------------------------------
 * The organisation is resolved server-side; this form does not need to know it
 * --------------------------------------------------------------------------------------------
 * `POST /auth/login`'s `org_id` is **optional** (migration 0017, `public.find_org_for_login`):
 * omit it and the server resolves which single organisation holds an account at the submitted
 * address, exactly the way the mobile app's sign-in already works. This form used to require an
 * `org_id` up front and *remember* the last one used (in `localStorage`, keyed by
 * `ORG_STORAGE_KEY` below) so a plain visit to `/login` — without an invitation link's `?org=` —
 * would still have one to send.
 *
 * FOUND LIVE: that remembered value is not scoped to an account, only to a browser. An HR admin
 * who signs in to one organisation and later creates or is invited to a *second* one from the
 * same browser had the FIRST organisation's id silently attached to every subsequent login
 * attempt — including for the second organisation's own address, which does not exist under that
 * org's row-level-security scope. The result was indistinguishable from a wrong password: no user
 * row ever matched, so nothing was ever written (no failed-attempt counter, no lockout clock),
 * and the account was otherwise completely healthy. Removing the remembered value, and sending no
 * `org_id` at all by default, removes the whole class of bug rather than patching one instance of
 * it — the same fix the backend's own doc comment on `LoginRequest.org_id` already assumes any
 * normal sign-in will make.
 *
 * `?org=<uuid>` in the URL is still honoured for *this* visit only, for the one case the backend
 * cannot resolve on its own: `LoginRequest.org_id`'s doc comment states plainly that "a person
 * with accounts at two organisations signs in with this field set" — the server refuses to guess
 * between them. It is never written back to storage and never carried into a later visit.
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

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  ApiError,
  CLIENT_ERROR_CODES,
  apiRequest,
  clearSession,
  refreshSessionUserFromMe,
  setSession,
} from "@/api/client";
import type { UserRole } from "@/api/client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

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

/** Where a signed-in dashboard user lands — the real Overview route (agents.md §10.11 task 7),
 * now `(dashboard)/overview/page.tsx`. It used to be "/" itself; "/" is being freed for a public
 * marketing landing page, so this moved with the page rather than being left pointing at a URL
 * that will soon belong to something else. `login/page.test.tsx` asserts this exact value. */
const POST_LOGIN_DESTINATION = "/overview";

/** The invitation link's query parameter — honoured for this visit only, never persisted. */
const ORG_QUERY_PARAM = "org";

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
  forgotPassword: "Forgot your password?",
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
 * Reads the organisation from the invitation link for *this* visit only. `null` is a completely
 * ordinary result — most sign-ins have no `?org=` at all — not a state this component blocks on.
 */
function readOrgId(fromQuery: string | null): string | null {
  return fromQuery !== null && UUID_PATTERN.test(fromQuery) ? fromQuery : null;
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

  // Resolved once per mount, from this visit's query string only — never remembered across visits
  // (see the module docstring for why that used to be, and stopped being, safe).
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
  // `TextField` derives its own `<input id>-error` id, so these two are no longer spelled out
  // here — the ids it generates for `emailId`/`passwordId` are byte-identical to the ones this
  // file used to build, which is what keeps `login/page.test.tsx`'s `aria-describedby` read-back
  // passing unchanged.

  // `role="alert"` announces the failure; moving focus into it is what puts a keyboard user *at*
  // the reason rather than back at the top of the form with an announcement they cannot re-read.
  useEffect(() => {
    if (failure !== null) failureRef.current?.focus();
  }, [failure]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

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
        // `org_id` is omitted entirely for the ordinary case (no `?org=` this visit) — never a
        // remembered value from a previous visit, and never `null`, so the server resolves the
        // tenant from the address itself (`LoginRequest.org_id`'s doc comment). Sent only when an
        // invitation link supplied one for *this* visit, for the one case the server cannot
        // resolve on its own: an address that holds accounts at more than one organisation.
        body: { ...(orgId !== null ? { org_id: orgId } : {}), email: email.trim(), password },
        // The one thing this call needs the cookie for is *receiving* it. `credentials: "omit"` —
        // the default everywhere else in this app — makes the browser ignore `Set-Cookie`
        // altogether, so without this the backend's refresh cookie would be sent and silently
        // dropped, and every page reload would sign the user out again with nothing anywhere
        // explaining why. The cookie is `HttpOnly`, so this code cannot read what it just accepted;
        // the session it keeps is still the access token below and nothing more.
        sendSessionCookie: true,
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
      // Non-blocking — see `refreshSessionUserFromMe`'s own docstring (whitelabel scope gap fix).
      // `POST /auth/login` never carries this org's real `org_name`/`org_logo_url` by contract, so
      // without this an ordinary employee would see default Kayla branding for the rest of their
      // session; this fetches the real values in the background and must not delay the redirect.
      void refreshSessionUserFromMe();
      router.replace(POST_LOGIN_DESTINATION);
    } catch (error) {
      setFailure(messageFor(error));
    } finally {
      setSubmitting(false);
    }
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

      <TextField
        id={emailId}
        inputRef={emailRef}
        name="email"
        type="email"
        label={COPY.emailLabel}
        value={email}
        onValueChange={setEmail}
        error={fieldErrors.email}
        maxLength={EMAIL_MAX_LENGTH}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        aria-required="true"
      />

      <TextField
        id={passwordId}
        inputRef={passwordRef}
        name="password"
        type="password"
        label={COPY.passwordLabel}
        value={password}
        onValueChange={setPassword}
        error={fieldErrors.password}
        maxLength={PASSWORD_MAX_LENGTH}
        autoComplete="current-password"
        required
        aria-required="true"
      />

      <Link href="/forgot-password" className="self-end text-copy text-text-secondary underline underline-offset-2">
        {COPY.forgotPassword}
      </Link>

      <Button type="submit" fullWidth loading={submitting} loadingLabel={COPY.submitting}>
        {COPY.submit}
      </Button>
    </form>
  );
}
