/**
 * Tests for `SidebarNav` (agents.md §10.3 task 7, §10.5 task 13, §10.9 task 7, §10.11 tasks 4/10).
 *
 * P11 is the fourth phase to touch this file, in two concurrent tasks: one adds Overview and
 * Engagement (and reorders them to the front), the other adds Signals and Settings (appended at
 * the end — see `sidebar-nav.tsx`'s own docstring for why appending was the safe edit against a
 * concurrent reorder). Alongside Check-in Questions (P9), Cohorts (P3) and Knowledge Base (P5),
 * these tests exist mainly to pin that every real destination renders with a working link and the
 * correct active state, so a future phase's own nav item cannot silently break one already
 * shipped.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = { pathname: "/", replace: vi.fn() };

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

import { clearSession, getSession, setSession } from "@/api/client";

import { ALL_NAV_ITEMS, SidebarNav, brandInitialsFor, isActiveHref } from "./sidebar-nav";

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
    email: "hr@example.com",
    role: "hr_admin" as const,
    email_verified: true,
    last_login_at: null,
    org_name: "Okemah Community Care",
  },
};

const fetchMock = vi.fn();

beforeEach(() => {
  nav.pathname = "/cohorts";
  nav.replace.mockReset();
  clearSession();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => ({ status: "signed_out" }),
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  try {
    window.localStorage.clear();
  } catch {
    // Storage may be unavailable in some test environments; a fresh collapse state is fine.
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const USER = { email: "hr@example.com", role: "hr_admin" as const };

describe("SidebarNav", () => {
  it("lists every real destination with a working link", () => {
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/overview");
    expect(screen.getByRole("link", { name: "Engagement" }).getAttribute("href")).toBe(
      "/engagement",
    );
    expect(screen.getByRole("link", { name: "Cohorts" }).getAttribute("href")).toBe("/cohorts");
    expect(screen.getByRole("link", { name: "Knowledge Base" }).getAttribute("href")).toBe(
      "/knowledge-base",
    );
    expect(
      screen.getByRole("link", { name: "Check-in Questions" }).getAttribute("href"),
    ).toBe("/check-in-questions");
    expect(screen.getByRole("link", { name: "Signals" }).getAttribute("href")).toBe("/signals");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("marks Overview as the current page when the pathname is /overview — its own route", () => {
    nav.pathname = "/overview";
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe(
      "page",
    );
    // "/" must never also mark Cohorts (or anything else whose href it is not a prefix of)
    // current — a naive `startsWith` against an empty-suffix href would do exactly that.
    expect(screen.getByRole("link", { name: "Cohorts" }).getAttribute("aria-current")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Engagement" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks Engagement as the current page when the pathname is /engagement", () => {
    nav.pathname = "/engagement";
    render(<SidebarNav user={USER} />);

    expect(
      screen.getByRole("link", { name: "Engagement" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks Cohorts as the current page when the pathname is /cohorts", () => {
    nav.pathname = "/cohorts";
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("link", { name: "Cohorts" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Knowledge Base" }).getAttribute("aria-current"),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Check-in Questions" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks Knowledge Base as the current page under its own sub-routes", () => {
    nav.pathname = "/knowledge-base/upload";
    render(<SidebarNav user={USER} />);

    expect(
      screen.getByRole("link", { name: "Knowledge Base" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("marks Check-in Questions as the current page when the pathname is /check-in-questions", () => {
    nav.pathname = "/check-in-questions";
    render(<SidebarNav user={USER} />);

    expect(
      screen.getByRole("link", { name: "Check-in Questions" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("marks Signals as the current page when the pathname is /signals", () => {
    nav.pathname = "/signals";
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("link", { name: "Signals" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks Settings as the current page when the pathname is /settings", () => {
    nav.pathname = "/settings";
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Signals" }).getAttribute("aria-current")).toBeNull();
  });

  it("names the nav landmark and shows the signed-in user's email and role", () => {
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("navigation", { name: "Kayla Health dashboard" })).toBeDefined();
    expect(screen.getByText(/hr@example.com/)).toBeDefined();
  });
});

// ====================================================================================================
// The "/" hazard. Overview used to live at "/", and a nav item whose href is "/" makes every
// prefix test against it true for every route in the app — one careless `startsWith(item.href)`
// away from the landing page rendering as the active item on all eight screens at once. The
// current code avoids it by appending a slash before testing the prefix, which is correct but is
// a property of one expression rather than of the route table. These three tests pin both halves:
// the route table no longer contains "/" at all, and the matcher would still be safe if it did.
// ====================================================================================================

describe("SidebarNav — active matching cannot smear across every route", () => {
  it("has no destination pointing at the app root", () => {
    expect(ALL_NAV_ITEMS.map((item) => item.href)).not.toContain("/");
  });

  it("marks only the one item whose route you are actually on, on every route there is", () => {
    for (const current of ALL_NAV_ITEMS) {
      cleanup();
      nav.pathname = current.href;
      render(<SidebarNav user={USER} />);

      const current_ = current;
      const active = ALL_NAV_ITEMS.filter(
        (item) =>
          screen.getByRole("link", { name: item.label }).getAttribute("aria-current") === "page",
      );
      expect(active.map((item) => item.key)).toEqual([current_.key]);
    }
  });

  it("treats an href of / as an exact match only, never as a prefix of everything", () => {
    expect(isActiveHref("/", "/")).toBe(true);
    expect(isActiveHref("/cohorts", "/")).toBe(false);
    expect(isActiveHref("/overview", "/")).toBe(false);

    // …while a real section href still owns its own sub-routes.
    expect(isActiveHref("/cohorts/abc", "/cohorts")).toBe(true);
    expect(isActiveHref("/cohorts-archive", "/cohorts")).toBe(false);
  });
});

describe("SidebarNav — the brand block shows the customer, not the product", () => {
  it("shows the organisation's own name and initials when the session carries one", () => {
    render(<SidebarNav user={{ ...USER, org_name: "Okemah Community Care" }} />);

    expect(screen.getByText("Okemah Community Care")).toBeDefined();
    expect(screen.queryByText("Kayla Health")).toBeNull();
  });

  it("falls back to the product name when org_name is null — login never sends one", () => {
    render(<SidebarNav user={{ ...USER, org_name: null }} />);

    expect(screen.getByText("Kayla Health")).toBeDefined();
  });

  it("derives at most two initials, and keeps KH when there is nothing to derive from", () => {
    expect(brandInitialsFor("Okemah Community Care")).toBe("OC");
    expect(brandInitialsFor("Riverside")).toBe("R");
    expect(brandInitialsFor(null)).toBe("KH");
    expect(brandInitialsFor(undefined)).toBe("KH");
    expect(brandInitialsFor("   ")).toBe("KH");
    expect(brandInitialsFor("---")).toBe("KH");
  });
});

describe("SidebarNav — footer and the mobile drawer", () => {
  it("keeps Settings and Sign out together, after every other destination", () => {
    render(<SidebarNav user={USER} />);

    const rails = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(rails.at(-1)).toBe("/settings");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
  });

  it("tells the server to sign out — the only thing that can clear the HttpOnly cookie", async () => {
    setSession(SESSION);
    render(<SidebarNav user={USER} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/login");
    });

    // This used to be `clearSession()` and a redirect, and nothing else. That left the access
    // token live for up to fifteen more minutes and, now, would leave the dashboard's refresh
    // cookie in the browser entirely — this component cannot read it, let alone delete it, so only
    // `POST /auth/logout` can expire it, and only with the attribute triple that set it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/auth/logout");
    expect(init.method).toBe("POST");
    // The one reason this call opts in: `credentials: "omit"` would make the browser ignore the
    // expiry, and the cookie would survive a sign-out.
    expect(init.credentials).toBe("include");
    // No refresh token is sent, and the contract keeps the field optional for exactly that reason.
    expect(JSON.parse(String(init.body))).toEqual({});
    expect(getSession()).toBeNull();
  });

  it("signs out locally even when the server call fails", async () => {
    setSession(SESSION);
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<SidebarNav user={USER} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    // A person who clicked "Sign out" must end up signed out of this tab and on the login page,
    // whatever the network did. Leaving their dashboard on screen because a request failed is the
    // worst of both outcomes.
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/login");
    });
    expect(getSession()).toBeNull();
  });

  it("offers no dismiss control while the drawer is closed, and two while it is open", () => {
    const { rerender } = render(<SidebarNav user={USER} />);
    expect(screen.queryAllByRole("button", { name: "Close navigation" })).toHaveLength(0);

    const onMobileClose = vi.fn();
    rerender(<SidebarNav user={USER} mobileOpen onMobileClose={onMobileClose} />);

    const dismissals = screen.getAllByRole("button", { name: "Close navigation" });
    expect(dismissals).toHaveLength(2); // the backdrop, and the ✕ inside the drawer

    for (const dismissal of dismissals) {
      fireEvent.click(dismissal);
    }
    expect(onMobileClose).toHaveBeenCalledTimes(2);
  });

  it("closes the drawer when a destination inside it is followed", () => {
    const onMobileClose = vi.fn();
    render(<SidebarNav user={USER} mobileOpen onMobileClose={onMobileClose} />);

    fireEvent.click(screen.getByRole("link", { name: "Cohorts" }));
    expect(onMobileClose).toHaveBeenCalled();
  });
});
