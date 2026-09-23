/**
 * `saveBranding` — the one save sequence `BrandingSection` (`settings/page.tsx`) and
 * `OrgBrandingStep` (`org-branding-step.tsx`) both call instead of each hand-rolling their own
 * upload-then-patch flow (code-review gate B1/B2/B10).
 *
 * The behaviour worth pinning directly, rather than only through each component's own tests, is
 * the incremental-apply guarantee: a logo that uploads successfully must be reflected in the
 * session (via `updateSessionUser`) and in the caller's own `onSaved` the instant it lands — before
 * the name PATCH is even attempted — so a name PATCH that then fails never discards a
 * successfully-uploaded logo from the UI. B7's `LogoSubmitError` marker is pinned alongside it,
 * since a caller's whole reason to check `instanceof LogoSubmitError` is to avoid rendering a
 * second alert for a failure `LogoUploadField` already showed inline.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, getSession, setSession } from "@/api/client";

import type { BrandingResponse } from "./branding";
import { LogoSubmitError, saveBranding } from "./branding";

const SESSION = {
  tokens: {
    access_token: "access-token-value",
    token_type: "bearer" as const,
    expires_in: 900,
    expires_at: "2026-01-01T00:15:00Z",
    refresh_token: "refresh-token-value",
    refresh_expires_at: "2026-01-08T00:00:00Z",
  },
  user: {
    id: "9f1c2b3a-0000-4000-8000-000000000099",
    email: "owner@example.com",
    role: "org_owner" as const,
    email_verified: true,
    last_login_at: null,
    org_name: null,
    org_logo_url: null,
  },
};

const LOGO_RESULT: BrandingResponse = {
  org_id: "9f1c2b3a-0000-4000-8000-000000000001",
  display_name: "Original Name",
  logo_url: "https://cdn.example/logo.png",
  has_custom_branding: true,
  updated_at: "2026-01-01T00:00:00Z",
};

const NAME_RESULT: BrandingResponse = {
  ...LOGO_RESULT,
  display_name: "New Name",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  setSession(SESSION);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("saveBranding", () => {
  it("applies the logo's result to the session before attempting the name PATCH, and the name failure does not undo it", async () => {
    const onSaved = vi.fn();
    const logo = { submit: vi.fn().mockResolvedValue(LOGO_RESULT) };
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed")); // the name PATCH

    await expect(
      saveBranding({ logo, displayNameToSave: "New Name", onSaved }),
    ).rejects.toThrow();

    // The logo's own result was applied — to the caller's draft and to the session — *before* the
    // name PATCH was even attempted, exactly once, and the later failure did not roll it back.
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(LOGO_RESULT);
    expect(getSession()?.user.org_logo_url).toBe("https://cdn.example/logo.png");
    expect(getSession()?.user.org_name).toBe("Original Name");
  });

  it("applies the name PATCH's own result once it succeeds, on top of an already-applied logo", async () => {
    const onSaved = vi.fn();
    const logo = { submit: vi.fn().mockResolvedValue(LOGO_RESULT) };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, NAME_RESULT));

    await saveBranding({ logo, displayNameToSave: "New Name", onSaved });

    expect(onSaved).toHaveBeenNthCalledWith(1, LOGO_RESULT);
    expect(onSaved).toHaveBeenNthCalledWith(2, NAME_RESULT);
    expect(getSession()?.user.org_name).toBe("New Name");
    expect(getSession()?.user.org_logo_url).toBe("https://cdn.example/logo.png");
  });

  it("skips the logo step entirely when none is given, and only PATCHes the name", async () => {
    const onSaved = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, NAME_RESULT));

    await saveBranding({ logo: null, displayNameToSave: "New Name", onSaved });

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(NAME_RESULT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no logo and no name change to save", async () => {
    const onSaved = vi.fn();

    await saveBranding({ logo: null, displayNameToSave: null, onSaved });

    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps a failing logo submit() in LogoSubmitError and never attempts the name PATCH", async () => {
    const onSaved = vi.fn();
    const uploadFailure = new Error("could not upload");
    const logo = { submit: vi.fn().mockRejectedValue(uploadFailure) };

    const rejection = saveBranding({ logo, displayNameToSave: "New Name", onSaved });

    await expect(rejection).rejects.toBeInstanceOf(LogoSubmitError);
    await rejection.catch((error: LogoSubmitError) => {
      expect(error.cause).toBe(uploadFailure);
    });
    expect(onSaved).not.toHaveBeenCalled();
    // The name PATCH must never fire on top of a failed logo save — the original ordering
    // rationale both call sites documented, preserved by the shared function.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
