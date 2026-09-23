/**
 * The client-side pieces of the org-branding domain (whitelabel Phase 2) that would otherwise be
 * written twice: once by `org-branding-step.tsx` (the mandatory-but-skippable onboarding step)
 * and once by `(dashboard)/settings/page.tsx`'s Branding section. Both call the same four
 * `kayla.branding` endpoints and must reject the same files for the same reason before either one
 * makes a network request — copying the two constants and the validation function into each file
 * is exactly the kind of drift `kb-upload-flow.tsx`'s own extension/size check was written once to
 * avoid, just for a second upload flow.
 */

import { ApiError, CLIENT_ERROR_CODES, apiRequest, updateSessionUser } from "@/api/client";
import type { components } from "@/api/generated";

export type BrandingResponse = components["schemas"]["BrandingResponse"];
export type BrandingUpdateRequest = components["schemas"]["BrandingUpdateRequest"];

/**
 * `kayla.branding.models`/`OrgBranding.display_name` — mirrors the column's own `varchar(200)`.
 * Lived as a raw `200` literal duplicated in both `org-branding-step.tsx` and `settings/page.tsx`
 * until a code-review gate flagged the drift risk; both now import this instead.
 */
export const DISPLAY_NAME_MAX_LENGTH = 200;

/**
 * `kayla.branding.storage.ALLOWED_CONTENT_TYPES` — png/jpeg/webp only (no SVG: an uploaded SVG can
 * carry a script payload, and this is rendered directly as an <img> src and a favicon; the backend
 * enforces the identical allowlist server-side regardless of what this array says).
 */
export const LOGO_ACCEPTED_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

const ACCEPTED_LABEL = "PNG, JPEG or WEBP";

/** `kayla.branding.schemas`/`LogoPresignResponse.max_size_bytes` — 5 MB, fixed server-side. */
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The two checks the brief asks be done "before any network request that could fail silently":
 * file type and size. Purely a courtesy — `POST .../logo/presign` and `.../logo/confirm` both
 * re-validate against the real bytes and are the actual enforcement — but catching an obviously
 * wrong file in milliseconds instead of after a presign round trip is worth the duplication of a
 * rule the server also states.
 */
export function validateLogoFile(file: File): string | null {
  if (!LOGO_ACCEPTED_TYPES.includes(file.type)) {
    return `Choose a ${ACCEPTED_LABEL} image.`;
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "Logos must be 5 MB or smaller.";
  }
  return null;
}

/**
 * §8.2 error rendering for the branding surface, matching every other flow's own `messageFor` —
 * branch on `error.code`/transport failure, never echo a raw network exception to the screen.
 */
export function brandingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (
      error.code === CLIENT_ERROR_CODES.networkUnreachable ||
      error.code === CLIENT_ERROR_CODES.responseNotUnderstood
    ) {
      return "Kayla is not reachable right now. Try again in a moment.";
    }
    return error.message || fallback;
  }
  return fallback;
}

/* -------------------------------------------------------------------------------------------
 * The shared save sequence (code-review gate B1/B2/B10)
 * --------------------------------------------------------------------------------------------
 * `BrandingSection` (`settings/page.tsx`) and `OrgBrandingStep` (`org-branding-step.tsx`) each used
 * to hand-roll the identical "upload the logo, then PATCH the name, then apply whichever changed"
 * sequence. Two problems came from that duplication rather than from either copy individually:
 *
 * 1. Both copies applied the result to the session/UI only *after* every step had succeeded — so a
 *    logo that uploaded fine, followed by a name PATCH that then threw, left the new logo sitting
 *    on the server with nothing in the session, sidebar or tab title reflecting it until a full
 *    page reload. `saveBranding` below applies each step's result the moment that step succeeds,
 *    before attempting the next one, so a later failure never discards earlier, already-durable
 *    progress.
 * 2. Fixing the above in one file and not the other would leave the bug half-fixed. One function,
 *    two call sites.
 * ---------------------------------------------------------------------------------------- */

/**
 * The minimal shape `saveBranding` needs from `LogoUploadField`'s own `LogoUploadHandle`
 * (`logo-upload-field.tsx`) — structural, not imported, so this module does not have to import
 * from a component file it is itself imported by.
 */
export interface LogoSubmitter {
  submit(): Promise<BrandingResponse | null>;
}

/**
 * Marks a `saveBranding` rejection as having come from the logo `submit()` step specifically, so a
 * caller can tell it apart from a name-PATCH failure (code-review gate B7).
 *
 * `LogoUploadField.submit()` already renders its own inline `role="alert"` for exactly this
 * failure (see that component's `phase.kind === "error"` branch) before rejecting — a caller that
 * *also* renders a second alert for the same rejection makes a screen reader announce one failure
 * twice. Catching this type is how a caller recognises "already shown, say nothing more" without
 * either module having to import the other's error-rendering internals.
 */
export class LogoSubmitError extends Error {
  constructor(readonly cause: unknown) {
    super("Logo upload failed — see the field's own inline error.");
    this.name = "LogoSubmitError";
  }
}

export interface SaveBrandingInput {
  /** The logo field's imperative handle, or `null`/omitted when this screen has none (there is
   * always one today, but this keeps the function honest about what it actually needs). `submit()`
   * is already a no-op returning `null` when nothing new was picked. */
  readonly logo?: LogoSubmitter | null;
  /** The trimmed display name to PATCH, or `null` to skip the name write entirely — the caller has
   * already decided whether the name actually changed. */
  readonly displayNameToSave: string | null;
  /**
   * Called the instant EITHER step's response lands — once for the logo (if one was uploaded),
   * again for the name (if one was sent) — so each success is durably reflected in the caller's
   * own state and the session (`updateSessionUser`) before the next step is even attempted. See
   * this section's own docstring for why "apply once, at the very end" was the bug.
   */
  readonly onSaved: (next: BrandingResponse) => void;
}

/**
 * Apply one `BrandingResponse` to both the caller's own draft state and the in-memory session, so
 * the sidebar/tab-title reflect it immediately — the "no re-login required" acceptance criterion
 * both `org-branding-step.tsx` and `settings/page.tsx`'s Branding section have to meet.
 *
 * Exported (not just used internally by `saveBranding`) for `settings/page.tsx`'s "Reset to
 * default" and "Remove logo" actions — each is a single `PATCH`, not the upload-then-name
 * sequence `saveBranding` coordinates, but still needs the identical apply-to-session step.
 */
export function applyBrandingUpdate(latest: BrandingResponse, onSaved: (next: BrandingResponse) => void): void {
  onSaved(latest);
  updateSessionUser({ org_name: latest.display_name, org_logo_url: latest.logo_url ?? null });
}

/**
 * The one save sequence both call sites use: upload the logo first (the slower, more
 * failure-prone of the two), applying its result the moment it lands, then PATCH the display name
 * if one was asked for, applying that too. If the logo step throws, the name step is never
 * attempted (matching both callers' original ordering rationale — do not PATCH a name on top of a
 * failed logo save without the person knowing the logo part didn't happen), and the rejection is
 * wrapped in `LogoSubmitError` so the caller can skip its own duplicate error alert (B7). If the
 * name step throws, the logo's own already-applied update is unaffected — the caller's catch only
 * has the name failure left to report.
 */
export async function saveBranding(input: SaveBrandingInput): Promise<void> {
  let uploaded: BrandingResponse | null;
  try {
    uploaded = (await input.logo?.submit()) ?? null;
  } catch (cause) {
    throw new LogoSubmitError(cause);
  }
  if (uploaded !== null) {
    applyBrandingUpdate(uploaded, input.onSaved);
  }

  if (input.displayNameToSave !== null) {
    const latest = await apiRequest("patch", "/dashboard/settings/branding", {
      body: { display_name: input.displayNameToSave },
    });
    applyBrandingUpdate(latest, input.onSaved);
  }
}
