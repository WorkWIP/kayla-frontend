/**
 * The scope-gap fix (whitelabel PRD, code-review gate): `restoreSession` and a successful login
 * both now fire a non-blocking background `GET /auth/me` (`refreshSessionUserFromMe`) and merge its
 * `org_name`/`org_logo_url` into the in-memory session, because `POST /auth/login` and
 * `POST /auth/session` both leave those two fields `null` by contract (see
 * `AuthenticatedUser.org_name`'s own doc comment in `generated.ts`) — only `GET /auth/me` and org
 * signup ever populate them for real.
 *
 * This file tests that mechanism directly against `src/api/client.ts`, the same way
 * `kayla-mobile/src/api/client.test.ts` tests its own, identically-shaped `refreshBranding` fix:
 * with genuinely overlapping requests (a controllable/deferred `fetch`), not sequential ones —
 * sequential mocks cannot exercise the `sessionGeneration` guard at all, since nothing is ever
 * actually in flight when the next state change happens.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSession,
  getSession,
  refreshSessionUserFromMe,
  restoreSession,
  setSession,
} from "./client";

const USER_A = {
  id: "9f1c2b3a-0000-4000-8000-0000000000aa",
  email: "owner@org-a.example",
  role: "org_owner" as const,
  email_verified: true,
  last_login_at: null,
  org_name: null,
  org_logo_url: null,
};

const USER_B = {
  id: "9f1c2b3a-0000-4000-8000-0000000000bb",
  email: "owner@org-b.example",
  role: "org_owner" as const,
  email_verified: true,
  last_login_at: null,
  org_name: null,
  org_logo_url: null,
};

function sessionFor(user: typeof USER_A) {
  return {
    tokens: {
      access_token: "access-token-value",
      token_type: "bearer" as const,
      expires_in: 900,
      expires_at: "2026-01-01T00:15:00Z",
      refresh_token: "refresh-token-value",
      refresh_expires_at: "2026-01-08T00:00:00Z",
    },
    user,
  };
}

/** `RestoredSession` — what `POST /auth/session` answers with. Note the absent refresh token, and
 * that `org_name`/`org_logo_url` are null here exactly as they are on login, by contract. */
function restoredFor(user: typeof USER_A) {
  return {
    access_token: "restored-access-token",
    token_type: "bearer" as const,
    expires_in: 900,
    expires_at: "2026-01-01T00:15:00Z",
    user,
  };
}

function meFor(orgName: string, orgLogoUrl: string | null = null) {
  return {
    id: "9f1c2b3a-0000-4000-8000-0000000000aa",
    email: "owner@org-a.example",
    role: "org_owner" as const,
    email_verified: true,
    org_name: orgName,
    org_logo_url: orgLogoUrl,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
  } as unknown as Response;
}

/** A controllable stand-in for a slow response — lets a test hold a fetch open until it explicitly
 * resolves it, so two requests can be made to genuinely overlap rather than merely be mocked in
 * sequence. Mirrors `kayla-mobile/src/api/client.test.ts`'s helper of the same purpose. */
function deferredJsonResponse(): {
  promise: Promise<Response>;
  resolve: (status: number, body: unknown) => void;
} {
  let resolveFn!: (value: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    resolveFn = resolve;
  });
  return {
    promise,
    resolve: (status, body) => resolveFn(jsonResponse(status, body)),
  };
}

/** Lets a fire-and-forget `refreshSessionUserFromMe()` chain (fetch -> body read -> JSON.parse ->
 * `updateSessionUser`) actually run before an assertion reads `getSession()`. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const fetchMock = vi.fn();

beforeEach(() => {
  clearSession();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("refreshSessionUserFromMe", () => {
  it("merges org_name/org_logo_url from GET /auth/me into the session in memory", async () => {
    setSession(sessionFor(USER_A));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, meFor("DHD Home Care", "https://cdn.example/dhd.png")));

    await refreshSessionUserFromMe();

    expect(getSession()?.user.org_name).toBe("DHD Home Care");
    expect(getSession()?.user.org_logo_url).toBe("https://cdn.example/dhd.png");
  });

  it("is a no-op when there is no session to patch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, meFor("DHD Home Care")));

    await expect(refreshSessionUserFromMe()).resolves.toBeUndefined();
    expect(getSession()).toBeNull();
  });

  it("swallows a failed /auth/me and leaves the session exactly as it was", async () => {
    setSession(sessionFor(USER_A));
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));

    await expect(refreshSessionUserFromMe()).resolves.toBeUndefined();

    expect(getSession()?.user.org_name).toBeNull();
    expect(getSession()?.user.org_logo_url).toBeNull();
  });

  it("a stale response that resolves after clearSession() does not resurrect the session", async () => {
    setSession(sessionFor(USER_A));
    const deferred = deferredJsonResponse();
    fetchMock.mockReturnValueOnce(deferred.promise);

    // Started, but its /auth/me is still in flight — genuinely overlapping, not sequential.
    const pending = refreshSessionUserFromMe();

    clearSession();
    expect(getSession()).toBeNull();

    // The stale fetch finally lands, after the sign-out that should invalidate it.
    deferred.resolve(200, meFor("DHD Home Care"));
    await pending;

    // `updateSessionUser` is already a no-op on a null session, but the generation guard is what
    // stops this from ever reaching that call for a session that is not the one it was asked for.
    expect(getSession()).toBeNull();
  });

  it("org A's slow /auth/me resolving after org B has signed in never overwrites org B's fields", async () => {
    setSession(sessionFor(USER_A));
    const orgADeferred = deferredJsonResponse();
    fetchMock.mockReturnValueOnce(orgADeferred.promise);
    const orgAPending = refreshSessionUserFromMe();
    // Org A's /auth/me has NOT resolved yet — deliberately, unlike a sequential mock.

    // Org A signs out and org B signs in on the same tab before A's fetch ever landed.
    clearSession();
    setSession(sessionFor(USER_B));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, meFor("Org B", "https://cdn.example/b.png")));
    await refreshSessionUserFromMe();

    expect(getSession()?.user.org_name).toBe("Org B");

    // Org A's long-delayed response finally arrives — after org B is already signed in and
    // branded. Without the generation guard, this would overwrite org B's fields with org A's.
    orgADeferred.resolve(200, meFor("DHD Home Care", "https://cdn.example/dhd.png"));
    await orgAPending;
    await flush();

    expect(getSession()?.user.org_name).toBe("Org B");
    expect(getSession()?.user.org_logo_url).toBe("https://cdn.example/b.png");
  });
});

describe("restoreSession's background /auth/me", () => {
  it("adopts the restored session immediately, without waiting on the background fetch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, restoredFor(USER_A))); // POST /auth/session
    const meDeferred = deferredJsonResponse();
    fetchMock.mockReturnValueOnce(meDeferred.promise); // GET /auth/me, fire-and-forget

    const restored = await restoreSession();

    // `restoreSession` only awaited `/auth/session` itself — the non-blocking contract this fix
    // requires (a slow /auth/me must never delay the dashboard's restoring -> signed-in decision).
    expect(restored?.user.org_name ?? null).toBeNull();
    expect(getSession()?.user.org_name ?? null).toBeNull();

    meDeferred.resolve(200, meFor("DHD Home Care", "https://cdn.example/dhd.png"));
    await flush();

    expect(getSession()?.user.org_name).toBe("DHD Home Care");
    expect(getSession()?.user.org_logo_url).toBe("https://cdn.example/dhd.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never fetches /auth/me when the restore itself fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "unauthorized", message: "no session" } }),
    );

    await expect(restoreSession()).resolves.toBeNull();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSession()).toBeNull();
  });
});
