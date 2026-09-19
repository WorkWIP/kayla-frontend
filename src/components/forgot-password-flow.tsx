"use client";

/**
 * `/forgot-password` — the dashboard's request-a-reset-link form: `POST /auth/password-reset/request`.
 *
 * --------------------------------------------------------------------------------------------
 * The success state is unconditional
 * --------------------------------------------------------------------------------------------
 * `RAG.md` §12.3 / `PasswordResetRequest`'s own doc comment: the endpoint answers `202` with the
 * identical body whether the address has an account, has none, or holds one at more than one
 * organisation — "there is no spelling of this field, present or absent, right or wrong, that
 * tells a caller anything about whether an account exists." This component must not undo that by
 * branching the *screen* on the outcome, so there is exactly one success state and it never names
 * the address back or claims a message was definitely sent.
 *
 * `org_id` is never sent from here — this form has none to send (no invitation link led here),
 * and the backend resolves the organisation from the address itself, exactly as `login-form.tsx`
 * now does for an ordinary sign-in.
 */

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** `PasswordResetRequest.email` is `maxLength: 320`. */
const EMAIL_MAX_LENGTH = 320;

export const COPY = {
  emailLabel: "Work email",
  submit: "Send reset link",
  submitting: "Sending…",
  emailRequired: "Enter your work email address.",
  emailMalformed: "That does not look like an email address.",

  sentHeading: "Check your email",
  sentBody:
    "If an account exists at that address, a link to reset the password is on its way. It expires in 24 hours.",
  sendAnother: "Use a different email",
  backToSignIn: "Back to sign in",

  failureLead: "That did not go through.",
  rateLimited: "Too many attempts from this device. Wait a moment, then try again.",
  unavailable: "Kayla is not reachable right now. Try again in a moment.",
  unexpected: "Something went wrong. Try again.",
} as const;

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

function validate(email: string): string | undefined {
  const trimmed = email.trim();
  if (trimmed === "") return COPY.emailRequired;
  if (!EMAIL_PATTERN.test(trimmed)) return COPY.emailMalformed;
  return undefined;
}

export function ForgotPasswordFlow() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);

  const formId = useId();
  const emailId = `${formId}-email`;
  const sentHeadingId = `${formId}-sent`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFailure(null);
    const error = validate(email);
    setEmailError(error);
    if (error !== undefined) {
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      // No org_id: this form has none to send, and the backend resolves the tenant from the
      // address (`PasswordResetRequest.org_id`'s own doc comment).
      await apiRequest("post", "/auth/password-reset/request", {
        body: { email: email.trim() },
      });
      setSent(true);
    } catch (error) {
      setFailure(messageFor(error));
      failureRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <section
        aria-labelledby={sentHeadingId}
        className="flex flex-col gap-16 rounded-card-lg bg-surface-card p-32 shadow-elevation-card"
      >
        <h2
          id={sentHeadingId}
          ref={sentRef}
          tabIndex={-1}
          className="text-title text-text-primary focus:outline-hidden"
        >
          {COPY.sentHeading}
        </h2>
        <p className="text-body text-text-secondary">{COPY.sentBody}</p>
        <div className="flex flex-wrap items-center gap-12">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            {COPY.sendAnother}
          </Button>
          <LinkButton href="/login" variant="secondary">
            {COPY.backToSignIn}
          </LinkButton>
        </div>
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
        error={emailError}
        maxLength={EMAIL_MAX_LENGTH}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        aria-required="true"
      />

      <Button type="submit" fullWidth loading={submitting} loadingLabel={COPY.submitting}>
        {COPY.submit}
      </Button>

      <Link href="/login" className="text-copy text-text-secondary underline underline-offset-2">
        {COPY.backToSignIn}
      </Link>
    </form>
  );
}

export default ForgotPasswordFlow;
