/**
 * The authenticated shell: the rail, the top bar, the mobile drawer they share — and the boot.
 *
 * Two kinds of assertion live here. The first is layout and policy: "the top bar carries no account
 * action", because Settings and Sign out belong in the sidebar footer per
 * `kb/design_system/components/dashboard/SidebarNavigation.prompt.md`, and an action a person can
 * reach from two places is an action they have to check twice. A future top bar can grow a search
 * box or a breadcrumb; if it grows a sign-out, one of these tests is the thing that says no.
 *
 * The second is the **three-state boot**, and it is the reason `fetch` is mocked in this file at
 * all. A page reload destroys the in-memory access token, so the shell asks
 * `POST /auth/session` — which mints a new one from an `HttpOnly` cookie this code cannot read —
 * before deciding anything. That makes "no session yet" a third answer alongside signed-in and
 * signed-out, and the failure mode if it is collapsed back into two is specific and user-visible:
 * the login page flashes on every legitimate reload. So there is a test for each state, plus one
 * that the restore is asked for exactly **once** per mount (a second call would present a cookie
 * the first had already spent, which the backend reads as a stolen token and answers by revoking
 * the whole refresh family).
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, setSession } from "@/api/client";

const nav = { pathname: "/cohorts", replace: vi.fn() };

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: nav.replace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { DashboardShell } from "./dashboard-shell";

const USER = {
  id: "9f1c2b3a-0000-4000-8000-000000000099",
  email: "hr@example.com",
  role: "hr_admin" as const,
  email_verified: true,
  last_login_at: null,
  org_name: "Okemah Community Care",
};

const SESSION = {
  tokens: {
    access_token: "access-token-value",
    token_type: "bearer" as const,
    expires_in: 900,
    expires_at: "2026-01-01T00:15:00Z",
    refresh_token: "refresh-token-value",
    refresh_expires_at: "2026-01-08T00:00:00Z",
  },
  user: USER,
};

/** `RestoredSession` — what `POST /auth/session` answers with. Note the absent refresh token. */
const RESTORED = {
  access_token: "restored-access-token",
  token_type: "bearer" as const,
  expires_in: 900,
  expires_at: "2026-01-01T00:15:00Z",
  user: USER,
};

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
  } as unknown as Response;
}

/** A `POST /auth/session` that never settles — the `restoring` state, held open for assertion. */
function pendingRestore(): void {
  fetchMock.mockReturnValue(new Promise<Response>(() => {}));
}

beforeEach(() => {
  nav.pathname = "/cohorts";
  nav.replace.mockReset();
  clearSession();
  fetchMock.mockReset();
  // The default for the tests that are about layout rather than about the boot: there is no cookie,
  // so the restore fails and the shell settles on signed-out — which is the state those tests then
  // move past by calling `setSession` before rendering.
  fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: "unauthorized", message: "no" } }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    window.localStorage.clear();
  } catch {
    // Storage may be unavailable; the rail copes, and so does this test.
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DashboardShell", () => {
  it("renders nothing — not a flash of chrome — once the restore says there is no session", async () => {
    const { container } = render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/login");
    });
    expect(container.firstElementChild).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("shows a neutral skeleton — never the login page — while the session is being restored", () => {
    pendingRestore();

    render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );

    // The announcement a screen reader gets, and the shape a sighted user gets. Both from
    // `PageSkeleton`, so the loading state is the same object every other page-level load uses.
    expect(screen.getByRole("status").textContent).toContain("Loading");
    // Nothing identifying, because we do not yet know whose dashboard this is — or whether it is
    // anybody's. And emphatically no redirect: this is the frame that used to send a signed-in
    // person to /login on every reload.
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText("Okemah Community Care")).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("restores the session from the cookie on reload and then renders the real shell", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, RESTORED));

    render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );

    // The product requirement: a reload keeps the session it would otherwise have destroyed.
    expect(await screen.findByRole("navigation", { name: "Kayla Health dashboard" })).toBeDefined();
    expect(within(screen.getByRole("main")).getByText("page body")).toBeDefined();
    expect(nav.replace).not.toHaveBeenCalled();

    // Exactly one request, to the one endpoint the cookie's Path admits, with the cookie attached.
    expect(fetchMock.mock.calls).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/auth/session");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("asks for a restore once per mount, not once per render", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, RESTORED));
    const { rerender } = render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );
    await screen.findByRole("navigation", { name: "Kayla Health dashboard" });

    rerender(
      <DashboardShell>
        <p>page body again</p>
      </DashboardShell>,
    );

    // A second `POST /auth/session` would present a cookie the first call already spent, which is
    // reuse detection's definition of a stolen token — the backend answers by revoking the whole
    // refresh family and signing the account out everywhere.
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it("does not ask at all when a session is already in memory", () => {
    setSession(SESSION);

    render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );

    // Signing in and navigating to the dashboard must not produce a skeleton frame, and must not
    // spend a cookie to learn something the app already knows.
    expect(screen.getByRole("navigation", { name: "Kayla Health dashboard" })).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts the rail beside the page, with the org name the session carries", () => {
    setSession(SESSION);
    render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );

    expect(screen.getByRole("navigation", { name: "Kayla Health dashboard" })).toBeDefined();
    expect(screen.getByText("Okemah Community Care")).toBeDefined();
    expect(within(screen.getByRole("main")).getByText("page body")).toBeDefined();
  });

  it("names the current page in the top bar, from the same match the rail marks current", () => {
    setSession(SESSION);
    nav.pathname = "/knowledge-base/upload";
    const { container } = render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );

    const topBar = container.querySelector("header");
    expect(topBar?.textContent).toContain("Knowledge Base");
    expect(
      screen.getByRole("link", { name: "Knowledge Base" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("carries no account action in the top bar — those live in the sidebar footer, once", () => {
    setSession(SESSION);
    const { container } = render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );

    const topBar = container.querySelector("header");
    expect(topBar).not.toBeNull();
    expect(within(topBar as HTMLElement).queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(within(topBar as HTMLElement).queryByRole("link", { name: "Settings" })).toBeNull();

    // …and exactly one of each, in the rail.
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(1);
  });

  it("opens the drawer from the top bar's hamburger and closes it again from inside", () => {
    setSession(SESSION);
    render(
      <DashboardShell>
        <p>page body</p>
      </DashboardShell>,
    );

    const hamburger = screen.getByRole("button", { name: "Open navigation" });
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("button", { name: "Close navigation" })).toHaveLength(0);

    fireEvent.click(hamburger);
    expect(
      screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded"),
    ).toBe("true");

    const dismissals = screen.getAllByRole("button", { name: "Close navigation" });
    expect(dismissals.length).toBeGreaterThan(0);
    fireEvent.click(dismissals[0] as HTMLElement);

    expect(screen.queryAllByRole("button", { name: "Close navigation" })).toHaveLength(0);
  });
});
