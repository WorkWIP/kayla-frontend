"use client";

/**
 * Steps two and three of organisation self-signup, on one screen:
 * `POST /orgs/signup/verify` then `POST /orgs/signup/complete`.
 *
 * --------------------------------------------------------------------------------------------
 * Why both steps live in one component
 * --------------------------------------------------------------------------------------------
 * They are one action from the person's point of view — they clicked a link, and they expect to
 * finish. Splitting them across two routes would mean putting the short-lived
 * `org_signup_token` into a second URL, which is exactly the thing a single-use credential must
 * not be carried in twice. So the emailed token is redeemed on mount, the ~15-minute token it
 * returns stays in component state, and the password is collected in place.
 *
 * --------------------------------------------------------------------------------------------
 * The four failures, and why each is handled differently
 * --------------------------------------------------------------------------------------------
 * `verification_token_invalid` · `_consumed` · `_expired` all mean "this link will never work",
 * so each gets its own sentence explaining which of the three happened and a route back to
 * `/signup` to start again. They are distinguished rather than collapsed because the recovery a
 * person needs is genuinely different: a consumed link usually means they already finished (or
 * double-clicked), an expired one means they need a fresh email, and an invalid one usually
 * means the link was truncated by a mail client.
 *
 * `password_too_weak` is the opposite case and must not be treated like the others.
 * `kayla/orgs/router.py`: "A password that fails the policy returns `password_too_weak` with the
 * machine-readable problems and **leaves the token usable**." Sending someone back to `/signup`
 * there would burn a perfectly good token and make them re-do the email round trip because they
 * chose a short password. So this renders the problems next to the field and lets them try
 * again, in place, with the same token.
 *
 * --------------------------------------------------------------------------------------------
 * The policy is shown before it is enforced
 * --------------------------------------------------------------------------------------------
 * `kayla.auth.passwords` sets a 12-character minimum. A person should not discover that by
 * failing, so it is the field's hint and it is checked client-side before the request goes out.
 * The client check is a courtesy, not the enforcement — the server owns the full policy (common
 * passwords, runs, sequences, context words) and its verdict is what is rendered when they
 * disagree.
 *
 * --------------------------------------------------------------------------------------------
 * `POST /orgs/signup/complete` answers 201, not 200
 * --------------------------------------------------------------------------------------------
 * It *creates* the organisation, so it is a `201 Created` carrying a full `SessionResponse`.
 * `apiRequest`'s `SuccessStatus` already includes 201, so the generated types resolve the body
 * without any special-casing here — but it is worth knowing before wondering why a `=== 200`
 * check would be wrong.
 *
 * --------------------------------------------------------------------------------------------
 * A fourth stage: the mandatory-but-skippable branding step (whitelabel PRD Phase 2)
 * --------------------------------------------------------------------------------------------
 * `POST /orgs/signup/complete` used to be followed directly by `router.replace("/overview")`.
 * It is now followed by one more screen, rendered by `org-branding-step.tsx`, before that
 * redirect ever fires — "mandatory" in that there is no code path from a freshly-created org to
 * the dashboard that skips rendering it at least once, "skippable" in that its own "Skip for now"
 * makes no network request at all. Account creation and email verification are unchanged and
 * still unblocked by anything branding-related: the org already exists and the session is already
 * set by the time this stage is reached, exactly as before.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest, setSession } from "@/api/client";
import { OrgBrandingStep } from "@/components/org-branding-step";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PageSkeleton } from "@/components/ui/skeleton";

/** `kayla.auth.passwords.PASSWORD_MIN_LENGTH`. Shown as a hint, not discovered by failing. */
export const PASSWORD_MIN_LENGTH = 12;

/** `kayla.auth.passwords.PASSWORD_MAX_LENGTH`. */
const PASSWORD_MAX_LENGTH = 128;

/** Where a signed-in dashboard user lands, matching `login-form.tsx`'s own destination. */
const POST_SIGNUP_DESTINATION = "/overview";

/** Where a dead link sends someone: back to step one. */
const SIGNUP_ROUTE = "/signup";

export const COPY = {
  verifying: "Confirming your link…",

  passwordLabel: "Choose a password",
  passwordHint: `At least ${PASSWORD_MIN_LENGTH} characters. A few ordinary words in a row work well.`,
  confirmLabel: "Type it again",
  submit: "Create organization",
  submitting: "Creating…",

  passwordRequired: "Choose a password.",
  passwordTooShort: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  confirmMismatch: "The two passwords do not match.",

  deadLinkHeading: "This link cannot be used",
  restart: "Start again",

  /** One sentence per dead-link code. Distinguished because the recovery differs. */
  tokenInvalid:
    "This link was not recognised. Mail clients sometimes cut long links in half — open the message again and copy the whole link, or use the code printed in it.",
  tokenConsumed:
    "This link has already been used. If the organization was created, sign in instead. If not, request a new link.",
  tokenExpired:
    "This link has expired. Links are good for 24 hours. Request a new one and it will arrive in a moment.",

  failureLead: "That did not go through.",
  passwordRejectedLead: "Choose a different password.",
  /** The fallback when the server sends `password_too_weak` with no recognised problems. */
  passwordRejected: "That password does not meet the policy.",
  rateLimited: "Too many attempts from this device. Wait a moment, then try again.",
  unavailable: "Kayla is not reachable right now. Try again in a moment.",
  unexpected: "Something went wrong. Try again.",
  signIn: "Sign in",
} as const;

/** The three codes that mean "this link is dead". Each maps to its own sentence. */
const DEAD_LINK_COPY: Readonly<Record<string, string>> = {
  verification_token_invalid: COPY.tokenInvalid,
  verification_token_consumed: COPY.tokenConsumed,
  verification_token_expired: COPY.tokenExpired,
};

/**
 * `kayla.auth.passwords.PasswordProblem`'s stable machine values, rendered in this app's own
 * words. The server also sends an English sentence; branching on the code rather than echoing
 * the message is what keeps this readable when `kayla.email`'s i18n reaches the API (§8.4).
 */
const PASSWORD_PROBLEM_COPY: Readonly<Record<string, string>> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  common_password: "This is one of the most commonly used passwords. Choose another.",
  repetitive_characters: "Avoid long runs of the same character.",
  sequential_characters: "Avoid long runs of characters in order.",
  contains_context_word: "Avoid your email address or the name of this service.",
  control_characters: "Remove any non-printing characters.",
};

/** Copy by §8.2 `error.code` for failures that are neither a dead link nor a weak password. */
const FAILURE_COPY: Readonly<Record<string, string>> = {
  rate_limited: COPY.rateLimited,
  service_unavailable: COPY.unavailable,
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
 * `details.problems` as the contract carries it: a list of machine values. Anything that is not
 * a list of strings is treated as absent rather than trusted, because this renders it.
 */
function problemsFrom(error: ApiError): readonly string[] {
  const { problems } = error.details as { problems?: unknown };
  if (!Array.isArray(problems)) return [];
  return problems.filter((problem): problem is string => typeof problem === "string");
}

/** What `POST /orgs/signup/verify` handed back, plus the token the final step spends. */
interface VerifiedSignup {
  readonly orgSignupToken: string;
  readonly organizationName: string;
  readonly workEmail: string;
  readonly fullName: string | null;
}

/**
 * The screen is exactly one of these at a time.
 *
 * `dead` carries the *code*, not the sentence, so the copy lives in one table and a test can
 * assert which branch was taken rather than matching prose.
 */
type Stage =
  | { readonly kind: "verifying" }
  | { readonly kind: "dead"; readonly code: string }
  | { readonly kind: "ready"; readonly signup: VerifiedSignup }
  | { readonly kind: "branding"; readonly organizationName: string };

export interface OrgSignupVerifyFlowProps {
  /** The `?token=` value, or `null` when the URL carries none. */
  readonly token: string | null;
}

export function OrgSignupVerifyFlow({ token }: OrgSignupVerifyFlowProps) {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>(() =>
    // No token at all is the same dead end as an unrecognised one, and the same sentence covers
    // both: the link is not something we can work with. Resolved during the first render rather
    // than after an effect, so there is never a frame claiming to be confirming nothing.
    token === null || token.trim() === ""
      ? { kind: "dead", code: "verification_token_invalid" }
      : { kind: "verifying" },
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
  /** Server-side policy verdict: the lead plus one line per `details.problems` entry. */
  const [policyProblems, setPolicyProblems] = useState<readonly string[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const deadRef = useRef<HTMLHeadingElement>(null);

  const formId = useId();
  const deadHeadingId = `${formId}-dead`;
  const readyHeadingId = `${formId}-ready`;

  /**
   * The token this component has already posted, if any.
   *
   * This is load-bearing rather than defensive. The emailed token is **single-use**: posting it
   * twice consumes it on the first request and gets `verification_token_consumed` back on the
   * second, which would show a working link as a dead one. `<StrictMode>` in development
   * deliberately runs every effect twice on the same instance — and a ref survives that, where a
   * piece of state would be reset — so without this guard the flow would be broken in
   * development and fine in production, which is the worst way round.
   */
  const redeemedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const emailedToken = token === null ? "" : token.trim();
    if (emailedToken === "" || redeemedTokenRef.current === emailedToken) return;
    redeemedTokenRef.current = emailedToken;

    let cancelled = false;

    // Declared inside the effect, matching `(dashboard)/overview/page.tsx` and every other
    // on-mount fetch in this app — the `react-hooks/set-state-in-effect` rule reads a setState
    // reached through a hoisted callback as a synchronous one, which it is not.
    async function redeem() {
      try {
        const verified = await apiRequest("post", "/orgs/signup/verify", {
          body: { token: emailedToken },
        });
        if (cancelled) return;
        setStage({
          kind: "ready",
          signup: {
            orgSignupToken: verified.org_signup_token,
            organizationName: verified.organization_name,
            workEmail: verified.work_email,
            fullName: verified.full_name ?? null,
          },
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && DEAD_LINK_COPY[error.code] !== undefined) {
          setStage({ kind: "dead", code: error.code });
          return;
        }
        // A rate limit or an unreachable API is not a dead link — the token is still good, and
        // the person can reload. `transient` carries no sentence of its own, so the dead-link
        // panel renders `failure` instead.
        setStage({ kind: "dead", code: "transient" });
        setFailure(messageFor(error));
      }
    }

    void redeem();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (stage.kind === "dead") deadRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (failure !== null || policyProblems !== null) noticeRef.current?.focus();
  }, [failure, policyProblems]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>, signup: VerifiedSignup) {
    event.preventDefault();
    if (submitting) return;

    setFailure(null);
    setPolicyProblems(null);

    // Emptiness and length here; everything else is the server's, because the server is the only
    // authority on the full policy and two copies of it would drift.
    let invalid = false;
    if (password === "") {
      setPasswordError(COPY.passwordRequired);
      invalid = true;
    } else if (password.length < PASSWORD_MIN_LENGTH) {
      setPasswordError(COPY.passwordTooShort);
      invalid = true;
    } else {
      setPasswordError(undefined);
    }

    if (!invalid && confirm !== password) {
      setConfirmError(COPY.confirmMismatch);
      confirmRef.current?.focus();
      return;
    }
    setConfirmError(undefined);

    if (invalid) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      // 201 Created, carrying a full SessionResponse — see the module docstring.
      const session = await apiRequest("post", "/orgs/signup/complete", {
        body: { org_signup_token: signup.orgSignupToken, password },
        // Same reason as `/auth/login`: this response drops a brand-new org owner straight into
        // the dashboard, and `credentials: "omit"` would make the browser discard the `HttpOnly`
        // refresh cookie that comes with it — so their very first page reload would sign them out
        // of the account they just created. See `RequestOptions.sendSessionCookie` in
        // `src/api/client.ts`.
        sendSessionCookie: true,
      });
      setSession(session);
      // Straight to the dashboard used to happen here. Now the mandatory-but-skippable branding
      // step renders first — see the module docstring — and it is that step's own "Skip for now"
      // or "Save & finish" that performs this exact redirect.
      setStage({ kind: "branding", organizationName: signup.organizationName });
    } catch (error) {
      if (error instanceof ApiError && error.code === "password_too_weak") {
        // The token survives this, so the person stays exactly where they are.
        const problems = problemsFrom(error)
          .map((problem) => PASSWORD_PROBLEM_COPY[problem])
          .filter((sentence): sentence is string => sentence !== undefined);
        setPolicyProblems(problems.length > 0 ? problems : [COPY.passwordRejected]);
        return;
      }
      if (error instanceof ApiError && DEAD_LINK_COPY[error.code] !== undefined) {
        // The 15-minute token ran out or was already spent while this screen was open.
        setStage({ kind: "dead", code: error.code });
        return;
      }
      setFailure(messageFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (stage.kind === "verifying") {
    return <PageSkeleton label={COPY.verifying} shape="form" count={1} />;
  }

  if (stage.kind === "dead") {
    const sentence = DEAD_LINK_COPY[stage.code] ?? failure ?? COPY.unexpected;
    return (
      <section
        aria-labelledby={deadHeadingId}
        className="flex flex-col gap-16 rounded-card-lg bg-surface-card p-32 shadow-elevation-card"
      >
        <h2
          id={deadHeadingId}
          ref={deadRef}
          tabIndex={-1}
          className="text-title text-text-primary focus:outline-hidden focus-visible:inset-shadow-focus-plum"
        >
          {COPY.deadLinkHeading}
        </h2>
        <p className="text-body text-text-secondary">{sentence}</p>
        <div className="flex flex-wrap items-center gap-12">
          <LinkButton href={SIGNUP_ROUTE}>{COPY.restart}</LinkButton>
          <LinkButton href="/login" variant="secondary">
            {COPY.signIn}
          </LinkButton>
        </div>
      </section>
    );
  }

  if (stage.kind === "branding") {
    return (
      <OrgBrandingStep
        organizationName={stage.organizationName}
        onDone={() => router.replace(POST_SIGNUP_DESTINATION)}
      />
    );
  }

  const { signup } = stage;

  return (
    <section
      aria-labelledby={readyHeadingId}
      className="flex flex-col gap-24 rounded-card-lg bg-surface-card p-32 shadow-elevation-card"
    >
      {/*
        The organisation and address are echoed back because the link may well have been opened
        on a different device from the one the form was filled in on — the contract says so
        outright (`OrgSignupVerified`), and echoing values the person just proved they control
        discloses nothing.
      */}
      <div className="flex flex-col gap-8">
        <h2 id={readyHeadingId} className="text-title text-text-primary">
          Set a password for {signup.organizationName}
        </h2>
        <p className="text-body text-text-secondary">
          {signup.workEmail} becomes the first owner of this organization.
        </p>
      </div>

      <form
        noValidate
        aria-busy={submitting}
        onSubmit={(event) => {
          void handleSubmit(event, signup);
        }}
        className="flex flex-col gap-24"
      >
        {failure !== null || policyProblems !== null ? (
          <div
            ref={noticeRef}
            role="alert"
            tabIndex={-1}
            className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16 focus:outline-hidden focus:inset-shadow-focus-plum"
          >
            <p className="text-label font-bold text-text-primary">
              {policyProblems !== null ? COPY.passwordRejectedLead : COPY.failureLead}
            </p>
            {policyProblems !== null ? (
              <ul className="flex flex-col gap-4">
                {policyProblems.map((problem) => (
                  <li key={problem} className="text-copy text-text-primary">
                    {problem}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-copy text-text-primary">{failure}</p>
            )}
          </div>
        ) : null}

        <TextField
          inputRef={passwordRef}
          name="password"
          type="password"
          label={COPY.passwordLabel}
          hint={COPY.passwordHint}
          value={password}
          onValueChange={setPassword}
          error={passwordError}
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          required
          aria-required="true"
        />

        <TextField
          inputRef={confirmRef}
          name="confirm-password"
          type="password"
          label={COPY.confirmLabel}
          value={confirm}
          onValueChange={setConfirm}
          error={confirmError}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          required
          aria-required="true"
        />

        <Button type="submit" fullWidth loading={submitting} loadingLabel={COPY.submitting}>
          {COPY.submit}
        </Button>
      </form>
    </section>
  );
}

/** The emailed link's query parameter — `kayla.email.templates` builds `/signup/verify?token=…`. */
const TOKEN_QUERY_PARAM = "token";

/**
 * The route's client boundary: reads `?token=` and hands it down.
 *
 * Kept separate from `OrgSignupVerifyFlow` so the flow itself takes the token as an ordinary
 * prop — every branch below is then reachable in a test without a router standing in the way.
 * Next.js requires any component reading URL data to sit under a `<Suspense>`, which the route
 * provides.
 */
export function OrgSignupVerifyFromUrl() {
  const searchParams = useSearchParams();
  return <OrgSignupVerifyFlow token={searchParams.get(TOKEN_QUERY_PARAM)} />;
}

export default OrgSignupVerifyFlow;
