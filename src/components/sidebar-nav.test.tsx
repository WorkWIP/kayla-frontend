/**
 * Tests for `SidebarNav` (agents.md §10.3 task 7, §10.5 task 13).
 *
 * P5 is the second phase to touch this file: it adds the Knowledge Base destination alongside
 * Cohorts. These tests exist mainly to pin that both real destinations render with a working
 * link and the correct active state, so a future phase's own nav item cannot silently break
 * either of the two already shipped.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = { pathname: "/cohorts" };

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { SidebarNav } from "./sidebar-nav";

beforeEach(() => {
  nav.pathname = "/cohorts";
  try {
    window.localStorage.clear();
  } catch {
    // Storage may be unavailable in some test environments; a fresh collapse state is fine.
  }
});

afterEach(() => {
  cleanup();
});

const USER = { email: "hr@example.com", role: "hr_admin" as const };

describe("SidebarNav", () => {
  it("lists both real destinations with working links", () => {
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("link", { name: "Cohorts" }).getAttribute("href")).toBe("/cohorts");
    expect(screen.getByRole("link", { name: "Knowledge Base" }).getAttribute("href")).toBe(
      "/knowledge-base",
    );
  });

  it("marks Cohorts as the current page when the pathname is /cohorts", () => {
    nav.pathname = "/cohorts";
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("link", { name: "Cohorts" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Knowledge Base" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks Knowledge Base as the current page under its own sub-routes", () => {
    nav.pathname = "/knowledge-base/upload";
    render(<SidebarNav user={USER} />);

    expect(
      screen.getByRole("link", { name: "Knowledge Base" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("names the nav landmark and shows the signed-in user's email and role", () => {
    render(<SidebarNav user={USER} />);

    expect(screen.getByRole("navigation", { name: "Kayla Health dashboard" })).toBeDefined();
    expect(screen.getByText(/hr@example.com/)).toBeDefined();
  });
});
