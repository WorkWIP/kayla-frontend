"use client";

/**
 * `/auth/reset-password` — where the password-reset email lands: `POST /auth/password-reset/confirm`.
 *
 * The path is not arbitrary: `kayla.email.templates.PASSWORD_RESET_PATH` is `"/auth/reset-password"`,
 * hardcoded into every reset email already sent. Moving this route breaks every link in flight.
 *
 * --------------------------------------------------------------------------------------------
 * The three dead-link codes, and the one that is not dead at all
 * --------------------------------------------------------------------------------------------
 * `verification_token_invalid` / `_consumed` / `_expired` mean this exact link will never work
 * again — the same three codes and the same reasoning `org-signup-verify-flow.tsx` documents for
 * its own link redemption, since both are `AuthService._claim_link_token` under the hood.
 *
 * `password_too_weak` is different and must not send anyone back to request a new link: the
 * backend's own doc comment on this endpoint says a weak password "leaves the link usable", so
 * this renders the problem next to the field and lets the same token be retried.
 *
 * --------------------------------------------------------------------------------------------
 * Success signs no one in
 * --------------------------------------------------------------------------------------------
 * Unlike org signup, `PasswordUpdated` carries no session — confirming a reset also revokes every
 * refresh family and live access token for the account (the backend's own description: "a
 * password change signs every device out"), so signing this browser in with the old, now-revoked
 * tokens makes no sense even if the response carried them. This links to `/login` instead.
 */

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/** `kayla.auth.passwords.PASSWORD_MIN_LENGTH`. Shown as a hint, not discovered by failing. */
export const PASSWORD_MIN_LENGTH = 12;
/** `kayla.auth.passwords.PASSWORD_MAX_LENGTH`. */
const PASSWORD_MAX_LENGTH = 128;

export const COPY = {
  passwordLabel: "New password",
  passwordHint: `At least ${PASSWORD_MIN_LENGTH} characters. A few ordinary words in a row work well.`,
  confirmLabel: "Type it again",
  submit: "Set new password",
  submitting: "Saving…",

  passwordRequired: "Choose a password.",
  passwordTooShort: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  confirmMismatch: "The two passwords do not match.",

  deadLinkHeading: "This link cannot be used",
  requestNew: "Request a new link",
  signIn: "Sign in",

  doneHeading: "Password updated",
  doneBody: "Sign in with your new password. Every other device has been signed out.",

  /** One sentence per dead-link code. Distinguished because the recovery differs. */
  tokenInvalid:
    "This link was not recognised. Mail clients sometimes cut long links in half — open the message again and copy the whole link.",
  tokenConsumed: "This link has already been used. Request a new one if you still need to reset your password.",
  tokenExpired: "This link has expired. Links are good for 24 hours. Request a new one.",

  failureLead: "That did not go through.",
  passwordRejectedLead: "Choose a different password.",
  passwordRejected: "That password does not meet the policy.",
  rateLimited: "Too many attempts from this device. Wait a moment, then try again.",
  unavailable: "Kayla is not reachable right now. Try again in a moment.",
  unexpected: "Something went wrong. Try again.",
} as const;

const DEAD_LINK_COPY: Readonly<Record<string, string>> = {
  verification_token_invalid: COPY.tokenInvalid,
  verification_token_consumed: COPY.tokenConsumed,
  verification_token_expired: COPY.tokenExpired,
};

/** `kayla.auth.passwords.PasswordProblem`'s stable machine values, in this app's own words —
 * mirrors `org-signup-verify-flow.tsx`'s identical table for the identical policy. */
const PASSWORD_PROBLEM_COPY: Readonly<Record<string, string>> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  common_password: "This is one of the most commonly used passwords. Choose another.",
  repetitive_characters: "Avoid long runs of the same character.",
  sequential_characters: "Avoid long runs of characters in order.",
  contains_context_word: "Avoid your email address or the name of this service.",
  control_characters: "Remove any non-printing characters.",
};

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

function problemsFrom(error: ApiError): readonly string[] {
  const { problems } = error.details as { problems?: unknown };
  if (!Array.isArray(problems)) return [];
  return problems.filter((problem): problem is string => typeof problem === "string");
}

type Stage =
  | { readonly kind: "form" }
  | { readonly kind: "dead"; readonly code: string }
  | { readonly kind: "done" };

export interface ResetPasswordFlowProps {
  /** The `?token=` value, or `null` when the URL carries none. */
  readonly token: string | null;
}

export function ResetPasswordFlow({ token }: ResetPasswordFlowProps) {
  const trimmedToken = token === null ? "" : token.trim();

  const [stage, setStage] = useState<Stage>(() =>
    trimmedToken === "" ? { kind: "dead", code: "verification_token_invalid" } : { kind: "form" },
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
  const [policyProblems, setPolicyProblems] = useState<readonly string[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const deadRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const formId = useId();
  const deadHeadingId = `${formId}-dead`;
  const doneHeadingId = `${formId}-done`;

  useEffect(() => {
    if (stage.kind === "dead") deadRef.current?.focus();
    if (stage.kind === "done") doneRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (failure !== null || policyProblems !== null) noticeRef.current?.focus();
  }, [failure, policyProblems]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFailure(null);
    setPolicyProblems(null);

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
      await apiRequest("post", "/auth/password-reset/confirm", {
        body: { token: trimmedToken, new_password: password },
      });
      setStage({ kind: "done" });
    } catch (error) {
      if (error instanceof ApiError && error.code === "password_too_weak") {
        const problems = problemsFrom(error)
          .map((problem) => PASSWORD_PROBLEM_COPY[problem])
          .filter((sentence): sentence is string => sentence !== undefined);
        setPolicyProblems(problems.length > 0 ? problems : [COPY.passwordRejected]);
        return;
      }
      if (error instanceof ApiError && DEAD_LINK_COPY[error.code] !== undefined) {
        setStage({ kind: "dead", code: error.code });
        return;
      }
      setFailure(messageFor(error));
    } finally {
      setSubmitting(false);
    }
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
          <LinkButton href="/forgot-password">{COPY.requestNew}</LinkButton>
          <LinkButton href="/login" variant="secondary">
            {COPY.signIn}
          </LinkButton>
        </div>
      </section>
    );
  }

  if (stage.kind === "done") {
    return (
      <section
        aria-labelledby={doneHeadingId}
        className="flex flex-col gap-16 rounded-card-lg bg-surface-card p-32 shadow-elevation-card"
      >
        <h2
          id={doneHeadingId}
          ref={doneRef}
          tabIndex={-1}
          className="text-title text-text-primary focus:outline-hidden"
        >
          {COPY.doneHeading}
        </h2>
        <p className="text-body text-text-secondary">{COPY.doneBody}</p>
        <LinkButton href="/login">{COPY.signIn}</LinkButton>
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
  );
}

/** The emailed link's query parameter — `kayla.email.templates.PASSWORD_RESET_PATH` builds
 * `/auth/reset-password?token=…`. */
const TOKEN_QUERY_PARAM = "token";

/**
 * The route's client boundary: reads `?token=` and hands it down, mirroring
 * `org-signup-verify-flow.tsx`'s `OrgSignupVerifyFromUrl` split for the same reason — every branch
 * of the flow itself is then reachable in a test without a router standing in the way.
 */
export function ResetPasswordFromUrl() {
  const searchParams = useSearchParams();
  return <ResetPasswordFlow token={searchParams.get(TOKEN_QUERY_PARAM)} />;
}

export default ResetPasswordFlow;
