/**
 * The client-side pieces of the org-branding domain (whitelabel Phase 2) that would otherwise be
 * written twice: once by `org-branding-step.tsx` (the mandatory-but-skippable onboarding step)
 * and once by `(dashboard)/settings/page.tsx`'s Branding section. Both call the same four
 * `kayla.branding` endpoints and must reject the same files for the same reason before either one
 * makes a network request — copying the two constants and the validation function into each file
 * is exactly the kind of drift `kb-upload-flow.tsx`'s own extension/size check was written once to
 * avoid, just for a second upload flow.
 */

import { ApiError, CLIENT_ERROR_CODES } from "@/api/client";
import type { components } from "@/api/generated";

export type BrandingResponse = components["schemas"]["BrandingResponse"];
export type BrandingUpdateRequest = components["schemas"]["BrandingUpdateRequest"];

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
