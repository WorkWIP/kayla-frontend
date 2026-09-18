"use client";

/**
 * The HR dashboard's left rail (agents.md §10.3 task 7 / §13.1: "sites/managers are entities,
 * not pages" — this file is the shell every dashboard screen renders inside, not a screen
 * itself).
 *
 * Re-authored from `kb/design_system/components/dashboard/SidebarNavigation.jsx` against this
 * project's GENERATED tokens (`src/styles/tokens.css`) rather than copied verbatim — the
 * reference file's inline `rgb(...)` literals and its own `--color-*` custom-property names do
 * not exist in this repo's token set, and pasting them in would be an R5 violation no less real
 * for coming from the design system itself. Every color, radius, shadow and spacing value below
 * resolves through a Tailwind utility backed by a token in `tokens.css`; a handful of the
 * reference's raw pixel values (28- and 10-pixel gaps, a fixed height of 720 pixels) have no matching token and
 * are re-authored to the nearest one that exists (24- and 12-pixel gaps, a stretched height) rather than
 * invented as new raw values — see the inline notes at each spot.
 *
 * --------------------------------------------------------------------------------------------
 * Scope for this phase (agents.md §10.3 / §10.5)
 * --------------------------------------------------------------------------------------------
 * Two real destinations as of P5: Cohorts (P3) and Knowledge Base (P5). The reference
 * component's full item list (Overview/Engagement/Recognition/Reports/Privacy) is gated behind
 * phases P9–P12 that do not exist yet. A link to a route with no page 404s, which is worse than
 * the link being absent, so this file lists only what a shipped phase actually built. Add the
 * next item here in the phase that builds the page it points to, not before.
 *
 * --------------------------------------------------------------------------------------------
 * Accessibility (agents.md §5.6 / R5.6 — the design system ships none of this)
 * --------------------------------------------------------------------------------------------
 * - The rail's root element is a `<nav>` with an accessible label (not an `<aside>`, unlike the
 *   reference), so assistive tech can jump straight to it as a landmark.
 * - The active item carries `aria-current="page"`, derived from the real pathname
 *   (`usePathname()`), never a manually-passed `active` key that can drift from the URL.
 * - Every item has a real accessible name: the label text is always present in the DOM (via
 *   `sr-only` when collapsed), never an icon alone.
 * - Every interactive element (nav links, the collapse toggle, sign-out) has a minimum touch
 *   target of 48 pixels — the design system's own scale steps 40 -> 48 with nothing in
 *   between, and 48 is the one that clears WCAG's 44x44 minimum (same reasoning
 *   `login-form.tsx` used for its controls).
 * - Real `<a>` elements (via `next/link`) and a real `<button>` for sign-out/collapse, so
 *   keyboard tab order and Enter/Space activation are native, not reimplemented.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactElement } from "react";

import { clearSession } from "@/api/client";
import type { UserRole } from "@/api/client";
import { LOGIN_ROUTE } from "@/lib/session";

export interface SidebarNavUser {
  readonly email: string;
  readonly role: UserRole;
}

export interface SidebarNavProps {
  readonly user: SidebarNavUser;
}

type NavIcon = "cohorts" | "knowledge-base";

interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: NavIcon;
}

/**
 * This phase's real destinations. See the file docstring for why this list is short on purpose
 * — extend it in the phase that ships the page each new entry would point to.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { key: "cohorts", label: "Cohorts", href: "/cohorts", icon: "cohorts" },
  { key: "knowledge-base", label: "Knowledge Base", href: "/knowledge-base", icon: "knowledge-base" },
];

/** `AuthenticatedUser.role` (agents.md §6.1), spelled out for the org/role line under the brand. */
const ROLE_LABEL: Record<UserRole, string> = {
  worker: "Worker",
  hr_admin: "HR Admin",
  org_owner: "Org Owner",
  manager: "Manager",
  kayla_ops: "Kayla Ops",
  superadmin: "Superadmin",
};

/**
 * `AuthenticatedUser` carries no organisation name or id (its own docstring: "carries no tenant
 * identifier") — `org_id` lives only in the login request, never the session. Rather than
 * invent a name the contract does not provide, the brand block shows what the session actually
 * has: the product name as the brand mark (the design system ships no logo file, §5.4), and the
 * signed-in person's own email and role underneath it. A later phase that adds `org_name` to
 * `AuthenticatedUser` can swap this line without touching anything else here.
 */
const BRAND_NAME = "Kayla Health";
const BRAND_INITIALS = "KH";

/** Per-viewer convenience only (agents.md's browser-storage guidance): which state the rail
 * remembers across visits. Never read for anything but this, never written by anyone else. */
const COLLAPSE_STORAGE_KEY = "kayla.dashboard.sidebar_collapsed";

function readRememberedCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    // Safari private mode, a blocked-storage policy, or no `window` yet (SSR) — expanded is a
    // perfectly good default, not a broken one.
    return false;
  }
}

function rememberCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Forgetting the preference next time is a smaller loss than throwing here.
  }
}

/**
 * 24×24 stroke glyphs at the exact path data `kb/design_system/components/core/Icon.jsx` draws
 * for these names (that file's own glyph map is not ported to this repo yet — a separate task —
 * so the two paths this rail needs are inlined rather than invented). Strokes only,
 * `currentColor`, 20 pixels: agents.md §5.5.
 */
function UsersGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LogOutGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

/**
 * Lucide's `file-text` glyph — the same inline-path approach `UsersGlyph` above already takes
 * (`Icon.jsx`'s own glyph map is not ported to this repo yet), used here for the Knowledge Base
 * nav item.
 */
function DocumentGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </svg>
  );
}

const NAV_ICON: Readonly<Record<NavIcon, () => ReactElement>> = {
  cohorts: UsersGlyph,
  "knowledge-base": DocumentGlyph,
};

/** Lucide's `chevron-left` is a mirror of `chevron-right`, drawn here as a 180° rotation of the
 * one glyph `Icon.jsx` actually ships, rather than a second hand-authored path. */
function ChevronGlyph({ pointingLeft }: { pointingLeft: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      style={{ transform: pointingLeft ? "rotate(180deg)" : undefined }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** Shared visual treatment for every rail row — nav links, sign-out, the collapse toggle. */
function railItemClass(collapsed: boolean, active: boolean): string {
  return [
    "flex min-h-48 items-center rounded-control font-core transition-colors",
    "duration-[var(--duration-fast)] ease-standard",
    "focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum",
    collapsed ? "w-48 justify-center" : "w-full justify-start gap-12 px-12",
    active
      ? "bg-surface-plum-tint font-bold text-text-link"
      : "font-medium text-text-secondary hover:bg-surface-warm-gray",
  ].join(" ");
}

export function SidebarNav({ user }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Read once, lazily: this component only ever mounts after `useAuthenticatedSession` has
  // confirmed a real session, which happens client-side only (see that hook's docstring), so
  // there is no server-rendered version of this rail for a lazy `localStorage` read to
  // disagree with on hydration.
  const [collapsed, setCollapsed] = useState<boolean>(readRememberedCollapsed);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      rememberCollapsed(next);
      return next;
    });
  }

  function handleSignOut() {
    clearSession();
    router.replace(LOGIN_ROUTE);
  }

  return (
    <nav
      aria-label="Kayla Health dashboard"
      className={[
        "flex h-full flex-col justify-between rounded-xl border border-hairline-sidebar",
        "bg-surface-sidebar py-24 shadow-raised",
        // 64 pixels collapsed / 232 pixels expanded (agents.md task 1). 64 is the design system's own
        // --spacing-64 token; 232 has no token of its own, so it is built from two that do
        // (64*3 + 40 = 232) rather than written as a bare literal — R5 stays a compiler-checked
        // property here, not a promise kept by eye.
        collapsed
          ? "w-64 items-center px-0"
          : "w-[calc(var(--spacing-64)*3+var(--spacing-40))] items-stretch px-12",
      ].join(" ")}
    >
      <div className="flex flex-col gap-24">
        <div
          className={[
            "flex items-center gap-12",
            collapsed ? "justify-center" : "justify-start px-4",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className="flex size-40 shrink-0 items-center justify-center rounded-full bg-bg-inverse font-core text-label font-extrabold text-text-inverse"
          >
            {BRAND_INITIALS}
          </span>
          {collapsed ? null : (
            <div className="flex min-w-0 flex-col gap-4">
              <span className="truncate text-label font-extrabold text-text-primary">
                {BRAND_NAME}
              </span>
              <span className="truncate text-meta font-medium text-text-tertiary">
                {user.email} · {ROLE_LABEL[user.role]}
              </span>
            </div>
          )}
        </div>

        <ul className="flex list-none flex-col gap-4 p-0">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = NAV_ICON[item.icon];
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={railItemClass(collapsed, active)}
                >
                  <Icon />
                  <span className={collapsed ? "sr-only" : "whitespace-nowrap text-label"}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          className={railItemClass(collapsed, false)}
        >
          <ChevronGlyph pointingLeft={!collapsed} />
          <span className={collapsed ? "sr-only" : "whitespace-nowrap text-label"}>
            {collapsed ? "Expand navigation" : "Collapse navigation"}
          </span>
        </button>
        <button type="button" onClick={handleSignOut} className={railItemClass(collapsed, false)}>
          <LogOutGlyph />
          <span className={collapsed ? "sr-only" : "whitespace-nowrap text-label"}>Sign out</span>
        </button>
      </div>
    </nav>
  );
}

export default SidebarNav;
