/**
 * Tests for `/signup/verify` — steps two and three of organisation self-signup.
 *
 * These drive the real page — `OrgSignupVerifyPage` -> `<Suspense>` -> `OrgSignupVerifyFromUrl`
 * -> `OrgSignupVerifyFlow` — so the Suspense boundary, the URL read and the two-request flow are
 * all exercised as they ship. `next/navigation` and `fetch` are the only stand-ins, for the same
 * reasons `login/page.test.tsx` states: there is no router outside the app and no backend here.
 *
 * The branch matrix this file exists to pin:
 *
 *   verify → invalid / consumed / expired   three distinct sentences, route back to /signup
 *   verify → transient (429, offline)       NOT treated as a dead link
 *   complete → 201                          session adopted, routed to /overview
 *   complete → password_too_weak            stays put, token still spendable, problems shown
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, getSession } from "@/api/client";

import OrgSignupVerifyPage, { metadata } from "./page";

const EMAILED_TOKEN = "emailed-token-abc";
const SIGNUP_TOKEN = "org-signup-token-xyz";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => nav.searchParams,
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lowercased = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lowercased.get(name.toLowerCase()) ?? null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function envelope(code: string, message: string, details: Record<string, unknown> = {}) {
  return { error: { code, message, details } };
}

/** `POST /orgs/signup/verify`'s 200 body, per `OrgSignupVerified`. */
function verified() {
  return {
    org_signup_token: SIGNUP_TOKEN,
    org_signup_token_expires_at: "2026-01-01T00:15:00Z",
    organization_name: "Sunrise Home Care",
    work_email: "dana@sunrisehomecare.com",
    full_name: "Dana Whitfield",
  };
}

/** `POST /orgs/signup/complete`'s **201** body — a full `SessionResponse`. */
function session() {
  return {
    tokens: {
      access_token: "access-token-value",
      token_type: "bearer",
      expires_in: 900,
      expires_at: "2026-01-01T00:15:00Z",
      refresh_token: "refresh-token-value",
      refresh_expires_at: "2026-01-08T00:00:00Z",
    },
    user: {
      id: "0f3f0d38-6d1a-4a2f-93bd-4b6f4e1a2c77",
      email: "dana@sunrisehomecare.com",
      role: "org_owner",
      email_verified: true,
      last_login_at: null,
      org_name: "Sunrise Home Care",
    },
  };
}

/** Wait for the emailed token to have been redeemed and the password screen to be up. */
async function reachPasswordStep() {
  render(<OrgSignupVerifyPage />);
  return await screen.findByLabelText("Choose a password");
}

function setPassword(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText("Choose a password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.searchParams = new URLSearchParams({ token: EMAILED_TOKEN });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearSession();
});

describe("/signup/verify — redeeming the emailed link", () => {
  it("is neither indexed nor followed — the URL carries a single-use token", () => {
    // A crawler that followed this link would redeem it, and the person who was sent it would
    // find a consumed token.
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("posts the ?token= from the URL, exactly once", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, verified()));

    await reachPasswordStep();

    const verifyCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/orgs/signup/verify"),
    );
    // Single-use: a second post would consume the token and turn a working link into a dead one.
    expect(verifyCalls).toHaveLength(1);
    const [, init] = verifyCalls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ token: EMAILED_TOKEN });
  });

  it("shows the organisation name and email back once the link is redeemed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, verified()));

    await reachPasswordStep();

    // The link may have been opened on a different device from the one the form was filled in
    // on — this is the only thing telling the person which signup they are finishing.
    expect(screen.getByRole("heading", { name: /Sunrise Home Care/ })).not.toBeNull();
    expect(screen.getByText(/dana@sunrisehomecare\.com/)).not.toBeNull();
  });

  it("shows the password policy before it is enforced", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, verified()));

    const password = await reachPasswordStep();

    // The minimum is 12 (`kayla.auth.passwords.PASSWORD_MIN_LENGTH`). Discovering it by failing
    // is the behaviour this asserts against.
    const describedBy = password.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const hint = document.getElementById((describedBy ?? "").split(" ")[0] ?? "");
    expect(hint?.textContent ?? "").toContain("At least 12 characters");
  });
});

describe("/signup/verify — the three dead-link branches", () => {
  const cases = [
    {
      code: "verification_token_invalid",
      // Mail clients truncating a long link is the usual cause, so the recovery names it.
      expected: "was not recognised",
    },
    {
      code: "verification_token_consumed",
      expected: "already been used",
    },
    {
      code: "verification_token_expired",
      expected: "has expired",
    },
  ] as const;

  for (const { code, expected } of cases) {
    it(`handles ${code} with its own sentence and a route back to /signup`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(400, envelope(code, "no")));

      render(<OrgSignupVerifyPage />);

      const panel = await screen.findByRole("region", { name: "This link cannot be used" });
      const text = panel.textContent ?? "";
      expect(text).toContain(expected);

      // The three must not collapse into one generic line: the recovery differs, so the copy
      // must too. Assert the other two sentences are NOT the one shown.
      for (const other of cases.filter((candidate) => candidate.code !== code)) {
        expect(text).not.toContain(other.expected);
      }

      // Start again, from step one.
      expect(screen.getByRole("link", { name: "Start again" }).getAttribute("href")).toBe("/signup");

      // No password field: there is nothing to spend.
      expect(screen.queryByLabelText("Choose a password")).toBeNull();
      expect(getSession()).toBeNull();
    });
  }

  it("treats a missing ?token= as an unrecognised link, without calling the API", async () => {
    nav.searchParams = new URLSearchParams();

    render(<OrgSignupVerifyPage />);

    const panel = await screen.findByRole("region", { name: "This link cannot be used" });
    expect(panel.textContent ?? "").toContain("was not recognised");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT treat a rate limit as a dead link", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, envelope("rate_limited", "Slow down."), { "Retry-After": "30" }),
    );

    render(<OrgSignupVerifyPage />);

    const panel = await screen.findByRole("region", { name: "This link cannot be used" });
    const text = panel.textContent ?? "";
    // The token is still good. Telling someone their link is expired when it is not would send
    // them to burn a second one.
    expect(text).toContain("Too many attempts");
    expect(text).not.toContain("has expired");
    expect(text).not.toContain("already been used");
  });
});

describe("/signup/verify — setting the password", () => {
  it("posts the org_signup_token, adopts the 201 session and routes to /overview", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, verified()))
      // 201 Created, not 200 — this request creates the organisation.
      .mockResolvedValueOnce(jsonResponse(201, session()));

    await reachPasswordStep();
    setPassword("correct horse battery staple");

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/overview");
    });

    const completeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/orgs/signup/complete"),
    ) as [string, RequestInit];
    expect(JSON.parse(String(completeCall[1].body))).toEqual({
      org_signup_token: SIGNUP_TOKEN,
      password: "correct horse battery staple",
    });

    // The session is established, so the dashboard renders instead of bouncing to /login.
    expect(getSession()?.user.role).toBe("org_owner");
  });

  it("lets the user retry after password_too_weak — the token is still spendable", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, verified()))
      .mockResolvedValueOnce(
        jsonResponse(
          422,
          envelope("password_too_weak", "Too weak.", {
            problems: ["common_password", "too_short"],
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(201, session()));

    await reachPasswordStep();
    setPassword("password1234");

    const alert = await screen.findByRole("alert");
    const text = alert.textContent ?? "";
    // One line per machine-readable problem, rendered from the code rather than echoing the
    // server's English.
    expect(text).toContain("most commonly used passwords");
    expect(text).toContain("at least 12 characters");

    // Crucially: still on the password screen, not sent back to /signup. `kayla/orgs/router.py`
    // says password_too_weak "leaves the token usable", so the email round trip must not be
    // repeated over a bad password choice.
    expect(screen.getByLabelText("Choose a password")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "This link cannot be used" })).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();

    // And the retry spends the same token.
    setPassword("a much better passphrase here");
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/overview");
    });
    const completeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/orgs/signup/complete"),
    );
    expect(completeCalls).toHaveLength(2);
    for (const [, init] of completeCalls as [string, RequestInit][]) {
      expect(JSON.parse(String(init.body)).org_signup_token).toBe(SIGNUP_TOKEN);
    }
  });

  it("falls back to a generic policy line when password_too_weak carries no known problems", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, verified()))
      .mockResolvedValueOnce(
        jsonResponse(422, envelope("password_too_weak", "Too weak.", { problems: ["unheard_of"] })),
      );

    await reachPasswordStep();
    setPassword("some password value");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("does not meet the policy");
  });

  it("checks the minimum length and the confirmation before the network", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, verified()));

    await reachPasswordStep();
    const beforeCalls = fetchMock.mock.calls.length;

    setPassword("short");
    expect(await screen.findByText("Use at least 12 characters.")).not.toBeNull();
    expect(fetchMock.mock.calls.length).toBe(beforeCalls);

    setPassword("a long enough password", "a different password");
    expect(await screen.findByText("The two passwords do not match.")).not.toBeNull();
    expect(fetchMock.mock.calls.length).toBe(beforeCalls);
  });

  it("falls back to the dead-link panel if the short-lived token expires mid-screen", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, verified()))
      .mockResolvedValueOnce(
        jsonResponse(400, envelope("verification_token_expired", "Gone.")),
      );

    await reachPasswordStep();
    setPassword("correct horse battery staple");

    const panel = await screen.findByRole("region", { name: "This link cannot be used" });
    expect(panel.textContent ?? "").toContain("has expired");
    expect(getSession()).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
