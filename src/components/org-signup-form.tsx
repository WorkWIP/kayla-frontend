"use client";

/**
 * Step one of organisation self-signup: `POST /orgs/signup/request`.
 *
 * --------------------------------------------------------------------------------------------
 * The success copy is written around a deliberately uninformative 202
 * --------------------------------------------------------------------------------------------
 * The contract (`OrgSignupRequested`, and the route description in `generated.ts`) is that this
 * endpoint answers `202 {"status":"accepted"}` **byte-identically** for a brand-new address, for
 * one that already has an account, and for one whose domain another organisation already uses.
 * No lookup of any kind runs at that step, so a caller cannot learn whether a company already
 * uses Kayla Health by asking.
 *
 * That makes one particular piece of copy a lie: "We've created your organisation — check your
 * email." We do not know that. Nothing was created, and the address may already belong to an
 * existing customer, in which case no signup mail is what the person will get. So the success
 * state below says only what is actually true — a message was sent *if* that address can start an
 * organisation — and names the address back so a typo is visible. Softening that into a
 * confident "your account is ready" would hand back, in words, exactly the oracle the constant
 * 202 was built to close.
 *
 * --------------------------------------------------------------------------------------------
 * `business_email_required` is the one failure that gets its own sentence
 * --------------------------------------------------------------------------------------------
 * `kayla/orgs/router.py` calls this out as a product rule rather than a security control, which
 * is precisely why it is safe — and necessary — to explain it. A person who typed a personal
 * address needs to be told to use their work one; rendering "check your details" at them instead
 * is a dead end. Every *other* failure keeps the generic treatment, because the codes this
 * endpoint can raise are otherwise deliberately uninformative.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/** `OrgSignupRequestRequest.work_email` is `maxLength: 320` in the contract. */
const EMAIL_MAX_LENGTH = 320;

/** `organization_name` and `full_name` are both bounded server-side; these mirror the contract. */
const ORGANIZATION_NAME_MAX_LENGTH = 200;
const FULL_NAME_MAX_LENGTH = 200;

/**
 * Deliberately permissive — something, an `@`, something with a dot. Identical in spirit to
 * `login-form.tsx`'s: it catches a typo before a network round trip and is not an authority on
 * whether an address is deliverable. The server is.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const COPY = {
  organizationLabel: "Organization name",
  organizationHint: "As it should appear to your team — “Sunrise Home Care”, not a short code.",
  emailLabel: "Work email",
  emailHint: "A business address at your organization’s own domain.",
  nameLabel: "Your full name (optional)",
  submit: "Create your organization",
  submitting: "Sending…",

  organizationRequired: "Enter your organization’s name.",
  emailRequired: "Enter your work email address.",
  emailMalformed: "That does not look like an email address.",

  failureLead: "That did not go through.",
  /**
   * The one specific, kind explanation. Named providers because "use a business address" without
   * an example is the kind of instruction people read twice and still get wrong.
   */
  businessEmailRequired:
    "Please use your work email address — free providers like gmail.com aren’t supported. An organization is opened against its own domain.",
  rateLimited: "Too many attempts from this device. Wait a moment, then try again.",
  unavailable: "Kayla is not reachable right now. Try again in a moment.",
  unexpected: "Something went wrong. Try again.",

  sentHeading: "Check your email",
  sentAction: "Use a different address",
} as const;

/** Copy by §8.2 `error.code`. Anything absent falls back to `COPY.unexpected`. */
const FAILURE_COPY: Readonly<Record<string, string>> = {
  business_email_required: COPY.businessEmailRequired,
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

interface FieldErrors {
  organizationName?: string;
  workEmail?: string;
}

function validate(organizationName: string, workEmail: string): FieldErrors {
  const errors: FieldErrors = {};

  if (organizationName.trim() === "") {
    errors.organizationName = COPY.organizationRequired;
  }

  const email = workEmail.trim();
  if (email === "") {
    errors.workEmail = COPY.emailRequired;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.workEmail = COPY.emailMalformed;
  }

  return errors;
}

export function OrgSignupForm() {
  const [organizationName, setOrganizationName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** The address the 202 came back for. Non-null means "show the sent state", and names it back. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const organizationRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);

  const formId = useId();
  const sentHeadingId = `${formId}-sent`;

  // Same reasoning as `login-form.tsx`: `role="alert"` announces the failure, and moving focus
  // into it is what puts a keyboard user *at* the reason rather than back at the top of the form.
  useEffect(() => {
    if (failure !== null) failureRef.current?.focus();
  }, [failure]);

  // The form is replaced wholesale by the sent state, so focus would otherwise fall back to
  // `<body>` and a screen-reader user would be told nothing at all about what just happened.
  useEffect(() => {
    if (sentTo !== null) sentRef.current?.focus();
  }, [sentTo]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFailure(null);

    const errors = validate(organizationName, workEmail);
    setFieldErrors(errors);
    if (errors.organizationName !== undefined) {
      organizationRef.current?.focus();
      return;
    }
    if (errors.workEmail !== undefined) {
      emailRef.current?.focus();
      return;
    }

    const email = workEmail.trim();
    const trimmedName = fullName.trim();

    setSubmitting(true);
    try {
      await apiRequest("post", "/orgs/signup/request", {
        body: {
          organization_name: organizationName.trim(),
          work_email: email,
          // Omitted rather than sent empty: the field is optional in the contract and `""` is a
          // value, not an absence.
          ...(trimmedName === "" ? {} : { full_name: trimmedName }),
        },
      });
      setSentTo(email);
    } catch (error) {
      setFailure(messageFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo !== null) {
    return (
      <section
        aria-labelledby={sentHeadingId}
        className="flex flex-col gap-16 rounded-card-lg bg-surface-card p-32 shadow-elevation-card"
      >
        <h2
          id={sentHeadingId}
          ref={sentRef}
          tabIndex={-1}
          className="text-title text-text-primary focus:outline-hidden focus-visible:inset-shadow-focus-plum"
        >
          {COPY.sentHeading}
        </h2>
        {/*
          Every sentence here is true of the constant 202 and of nothing more. "If that address
          can start an organization" is the honest form of a response that ran no lookup: it
          neither confirms nor denies that an account already exists at the address or its domain.
        */}
        <p className="text-body text-text-secondary">
          If <span className="font-bold text-text-primary">{sentTo}</span> can start an
          organization on Kayla Health, a message with a verification link is on its way to it. The
          link is good for 24 hours.
        </p>
        <p className="text-body text-text-secondary">
          Nothing has been created yet. The organization is opened at the last step, once the
          address is confirmed and a password is set.
        </p>
        <p className="text-copy text-text-secondary">
          No message after a few minutes? Check the spam folder, then confirm the address below.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setSentTo(null);
            setFailure(null);
          }}
        >
          {COPY.sentAction}
        </Button>
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
          {/* Colour is never the only signal (agents.md §5.5), and the body is near-black
              because persimmon-500 on its own subtle fill does not reach 4.5:1. */}
          <p className="text-label font-bold text-text-primary">{COPY.failureLead}</p>
          <p className="text-copy text-text-primary">{failure}</p>
        </div>
      ) : null}

      <TextField
        inputRef={organizationRef}
        name="organization"
        label={COPY.organizationLabel}
        hint={COPY.organizationHint}
        value={organizationName}
        onValueChange={setOrganizationName}
        error={fieldErrors.organizationName}
        maxLength={ORGANIZATION_NAME_MAX_LENGTH}
        autoComplete="organization"
        required
        aria-required="true"
      />

      <TextField
        inputRef={emailRef}
        name="work-email"
        type="email"
        label={COPY.emailLabel}
        hint={COPY.emailHint}
        value={workEmail}
        onValueChange={setWorkEmail}
        error={fieldErrors.workEmail}
        maxLength={EMAIL_MAX_LENGTH}
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        aria-required="true"
      />

      <TextField
        name="full-name"
        label={COPY.nameLabel}
        value={fullName}
        onValueChange={setFullName}
        maxLength={FULL_NAME_MAX_LENGTH}
        autoComplete="name"
      />

      <Button type="submit" fullWidth loading={submitting} loadingLabel={COPY.submitting}>
        {COPY.submit}
      </Button>
    </form>
  );
}

export default OrgSignupForm;
