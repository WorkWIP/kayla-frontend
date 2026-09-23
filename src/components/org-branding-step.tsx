"use client";

/**
 * The onboarding branding step (whitelabel PRD Phase 2 / agent.md Phase 2 task 1): a
 * mandatory-but-skippable screen shown once, immediately after `POST /orgs/signup/complete`
 * succeeds and before the brand-new org owner ever sees the dashboard.
 *
 * --------------------------------------------------------------------------------------------
 * Why this is a separate component from `org-signup-verify-flow.tsx`, not a fourth `Stage`
 * fully inlined there
 * --------------------------------------------------------------------------------------------
 * It is still reached from that flow's own state machine (`Stage`'s new `"branding"` member) —
 * account creation and email verification are unchanged and unblocked by anything here, exactly
 * as the PRD requires. Splitting it out keeps `org-signup-verify-flow.tsx` about *authenticating*
 * (verify token, set password, create the org) and this file about *branding a session that
 * already exists*, which is also why this can be the same component the Settings page's Branding
 * section composes its "add branding" call-to-action from later, rather than a one-off screen.
 *
 * --------------------------------------------------------------------------------------------
 * "Mandatory-but-skippable"
 * --------------------------------------------------------------------------------------------
 * Mandatory: the org owner cannot get from "account just created" to `/overview` without this
 * screen rendering at least once — there is no route that bypasses it. Skippable: "Skip for now"
 * makes zero network requests and goes straight to the dashboard with whatever default branding
 * the org already has (none, the first time this runs). Neither path can fail in a way that
 * strands the person outside their own new dashboard — see `handleSaveAndFinish`'s `catch`, which
 * renders an inline error and lets them retry *or* skip, never a dead end.
 *
 * --------------------------------------------------------------------------------------------
 * Why "Save & finish" can call two endpoints and still be one click
 * --------------------------------------------------------------------------------------------
 * A display-name change goes through `PATCH /dashboard/settings/branding`; a logo goes through
 * `LogoUploadField`'s own presign -> PUT -> confirm, exposed via `useImperativeHandle` (see that
 * file's docstring for why). This screen offers both in one field each, so "Save & finish" drives
 * both from a single submit handler — `saveBranding` (`src/lib/branding.ts`), the one save
 * sequence this component shares with `settings/page.tsx`'s Branding section rather than
 * reimplementing (a code-review gate found the two copies had drifted: applying the logo's result
 * only after the name PATCH also succeeded meant a successfully-uploaded logo could vanish from
 * the UI until a reload if the name PATCH then failed). See that function's own docstring for the
 * exact ordering and incremental-apply guarantee.
 *
 * --------------------------------------------------------------------------------------------
 * Updating the session in place
 * --------------------------------------------------------------------------------------------
 * `saveBranding` calls `updateSessionUser` (`src/api/client.ts`) itself, patching
 * `org_name`/`org_logo_url` on the session already held in memory from `setSession` (called by
 * `org-signup-verify-flow.tsx` right before this step renders) the instant each step succeeds.
 * Without it, the sidebar would show the *pre-branding* name/no-logo until a future full session
 * restore — the PRD's Phase 2 acceptance criterion is explicit that branding set during onboarding
 * must be visible in the sidebar "without a page reload requiring re-login".
 */

import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { LogoUploadHandle } from "@/components/logo-upload-field";
import { LogoUploadField } from "@/components/logo-upload-field";
import { DISPLAY_NAME_MAX_LENGTH, LogoSubmitError, brandingErrorMessage, saveBranding } from "@/lib/branding";

const GENERIC_SAVE_FAILURE = "Could not save your branding. Try again, or skip for now.";

export interface OrgBrandingStepProps {
  /** The organisation's name as submitted at signup — the effective display name until this org
   * writes its own branding row, and this field's starting value. */
  readonly organizationName: string;
  /** Called once branding has been saved (or the step was skipped) — the caller navigates. */
  readonly onDone: () => void;
}

export function OrgBrandingStep({ organizationName, onDone }: OrgBrandingStepProps) {
  const headingId = useId();
  const [displayName, setDisplayName] = useState(organizationName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<LogoUploadHandle>(null);

  function handleSkip() {
    if (submitting) return;
    onDone();
  }

  async function handleSaveAndFinish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const trimmedName = displayName.trim();
    // An empty box is treated as "no change" rather than an error — this step is skippable, and a
    // person who cleared the field almost certainly meant "leave it," not "reject my own org's
    // name," which is what `reset_display_name` is for and not what this screen exposes.
    const nameChanged = trimmedName !== "" && trimmedName !== organizationName;

    try {
      await saveBranding({
        logo: logoRef.current,
        displayNameToSave: nameChanged ? trimmedName : null,
        // No local draft to resync here — this step navigates away on success — so the only thing
        // to do with each incremental result is what `saveBranding` already does on its own:
        // update the session.
        onSaved: () => {},
      });
      onDone();
    } catch (caught) {
      if (caught instanceof LogoSubmitError) {
        // `LogoUploadField` already rendered its own inline alert for this exact failure — a
        // second one here would make a screen reader announce it twice (code-review gate B7).
        setSubmitting(false);
        return;
      }
      setError(brandingErrorMessage(caught, GENERIC_SAVE_FAILURE));
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-24 rounded-card-lg bg-surface-card p-32 shadow-elevation-card"
    >
      <div className="flex flex-col gap-8">
        <h2 id={headingId} className="text-title text-text-primary">
          Make it yours
        </h2>
        <p className="text-body text-text-secondary">
          Add your organization&rsquo;s name and logo so your team sees {organizationName}, not
          Kayla, when they sign in. You can always change this later from Settings.
        </p>
      </div>

      <form
        noValidate
        aria-busy={submitting}
        onSubmit={(event) => {
          void handleSaveAndFinish(event);
        }}
        className="flex flex-col gap-24"
      >
        {error !== null ? (
          <div
            role="alert"
            className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
          >
            <p className="text-label font-bold text-text-primary">That did not go through.</p>
            <p className="text-copy text-text-primary">{error}</p>
          </div>
        ) : null}

        <TextField
          label="Display name"
          hint="Shown in the sidebar and browser tab instead of your organization's registered name, if you'd rather your team see something else."
          value={displayName}
          onValueChange={setDisplayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          disabled={submitting}
          autoComplete="organization"
        />

        <LogoUploadField uploadRef={logoRef} disabled={submitting} label="Logo (optional)" />

        <div className="flex flex-wrap items-center gap-12">
          <Button type="submit" loading={submitting} loadingLabel="Saving…">
            Save &amp; finish
          </Button>
          <Button type="button" variant="ghost" disabled={submitting} onClick={handleSkip}>
            Skip for now
          </Button>
        </div>
      </form>
    </section>
  );
}

export default OrgBrandingStep;
