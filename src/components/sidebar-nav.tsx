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
 * reference's raw pixel values (28- and 10-pixel gaps, a fixed height of 720 pixels) have no
 * matching token and are re-authored to the nearest one that exists (24- and 12-pixel gaps, a
 * stretched height) rather than invented as new raw values.
 *
 * Two of the reference's own numbers are deliberately NOT matched: rows are 48 tall, not 40, and
 * the radius is `--radius-control` (12), not 10. 48 is the first step of this design system's
 * spacing scale at or above WCAG's 44-pixel target minimum (the scale steps 40 -> 48 with
 * nothing in between), and 10 is not a radius token at all. Both were already settled this way
 * before this rewrite; see the accessibility note at the bottom of this docstring.
 *
 * --------------------------------------------------------------------------------------------
 * Structure, per the design system's own spec
 * --------------------------------------------------------------------------------------------
 *   brand block  (the app mark — which is also the collapse control — org name, identity)
 *   nav items    (the seven real destinations)
 *   ...
 *   footer       (Settings, Sign out) — pinned to the bottom
 *
 * Settings sits in the footer rather than in the item list because `SidebarNavigation.prompt.md`
 * says so in as many words: "Footer items (Settings, Sign out) pin to the bottom." It is still a
 * real `<a href="/settings">` carrying `aria-current`, so nothing about how it is reached or
 * announced changed — only where it sits.
 *
 * The brand block is a `KH` plum disc no longer. `SidebarNavigation.prompt.md` said "there is no
 * logo file, so keep it as initials", and that was true; a real mark now ships at
 * `kb/design_system/assets/brand/kayla-logo.png`, so the disc gives way to it (see
 * `components/brand-mark.tsx` for why it renders as a plum mask rather than the supplied teal).
 * `brandInitialsFor` is kept and still exported: it remains the honest fallback for anywhere a
 * customer has to be identified by name rather than by our mark.
 *
 * --------------------------------------------------------------------------------------------
 * Responsive behaviour (new — this rail had none at all, and the dashboard was unusable on a
 * phone)
 * --------------------------------------------------------------------------------------------
 *   >= md (768)    a real rail, and the remembered collapse preference decides its width: 232
 *                  with labels, or 64 icons-only. Labels stay in the DOM as `sr-only` when the
 *                  rail is narrow, never dropped — an icon with no accessible name is not a
 *                  link, it is a puzzle.
 *   < md (768)     off-canvas. The rail is `hidden` (not merely translated off-screen, so its
 *                  links cannot be reached by Tab while invisible) until the top bar's hamburger
 *                  opens it, and then it is a fixed overlay above a dismiss backdrop, always in
 *                  its expanded shape.
 *
 * The preference used to apply at `lg` and up only, with `md`..`lg` forced to icons. That made
 * the toggle a no-op on exactly the displays where a narrow rail buys the most, so it now bites
 * everywhere there is a rail to narrow.
 *
 * `mobileOpen`/`onMobileClose` are owned by `dashboard-shell.tsx`, because the hamburger that
 * opens the drawer lives in the top bar, not in the drawer it opens. Both are optional so this
 * component still renders — closed — on its own.
 *
 * --------------------------------------------------------------------------------------------
 * Accessibility (agents.md §5.6 / R5.6 — the design system ships none of this)
 * --------------------------------------------------------------------------------------------
 * - The rail's root element is a `<nav>` with an accessible label (not an `<aside>`, unlike the
 *   reference), so assistive tech can jump straight to it as a landmark.
 * - The active item carries `aria-current="page"`, derived from the real pathname
 *   (`usePathname()`), never a manually-passed `active` key that can drift from the URL.
 * - Every item has a real accessible name at every breakpoint: the label text is always present
 *   in the DOM (`sr-only` when the rail is icons-only), never an icon alone.
 * - Every interactive element has a minimum touch target of 48 pixels.
 * - Real `<a>` elements (via `next/link`) and real `<button>`s, so keyboard tab order and
 *   Enter/Space activation are native, not reimplemented.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactElement } from "react";

import { apiRequest, clearSession } from "@/api/client";
import type { UserRole } from "@/api/client";
import { BrandMark } from "@/components/brand-mark";
import { LOGIN_ROUTE } from "@/lib/session";

export interface SidebarNavUser {
  readonly email: string;
  readonly role: UserRole;
  /**
   * `AuthenticatedUser.org_name` — the customer organisation's display name, straight off the
   * wire (a display string, never an identifier; see its own description in the generated
   * contract). Optional and nullable because `POST /auth/login` does not populate it — only
   * `GET /auth/me` and org signup do — so the rail has to work without it.
   */
  readonly org_name?: string | null;
}

export interface SidebarNavProps {
  readonly user: SidebarNavUser;
  /** Drawer state for the `< md` breakpoint. Owned by `dashboard-shell.tsx`. */
  readonly mobileOpen?: boolean;
  readonly onMobileClose?: () => void;
}

type NavIcon =
  | "overview"
  | "engagement"
  | "cohorts"
  | "knowledge-base"
  | "check-in-questions"
  | "signals"
  | "settings"
  | "actions";

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: NavIcon;
}

/**
 * This build's real destinations. Short on purpose — a link to a route with no page 404s, which
 * is worse than the link being absent, so this lists only what a shipped phase actually built.
 * Extend it in the phase that ships the page each new entry points to.
 *
 * Overview's href is `/overview`, not `/`. It used to own the app's root URL; that URL is being
 * freed for a public marketing page, and a nav item whose href is `/` is a hazard besides — every
 * prefix test against it is true for every route in the app.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "overview", label: "Overview", href: "/overview", icon: "overview" },
  { key: "engagement", label: "Engagement", href: "/engagement", icon: "engagement" },
  { key: "cohorts", label: "Cohorts", href: "/cohorts", icon: "cohorts" },
  { key: "knowledge-base", label: "Knowledge Base", href: "/knowledge-base", icon: "knowledge-base" },
  {
    key: "check-in-questions",
    label: "Check-in Questions",
    href: "/check-in-questions",
    icon: "check-in-questions",
  },
  { key: "signals", label: "Signals", href: "/signals", icon: "signals" },
  { key: "actions", label: "Actions", href: "/actions", icon: "actions" },
];

/** The footer's own destination. Separate from `NAV_ITEMS` because it renders in the footer. */
export const SETTINGS_ITEM: NavItem = {
  key: "settings",
  label: "Settings",
  href: "/settings",
  icon: "settings",
};

/** Every real destination, in rail order — for anything that has to map a URL back to a name. */
export const ALL_NAV_ITEMS: readonly NavItem[] = [...NAV_ITEMS, SETTINGS_ITEM];

/**
 * Is `href` the destination the current URL is on?
 *
 * The `/` guard is not decoration. With a nav item at `href: "/"`, a naive prefix test makes
 * every route in the app look like that item's child, and the landing page renders as the active
 * item on every screen at once. No item points at `/` any more, and this makes sure none can
 * reintroduce that by accident. `sidebar-nav.test.tsx` covers both halves.
 */
export function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item the given URL is on, if any — used by the top bar for its page-context line. */
export function findActiveNavItem(pathname: string): NavItem | null {
  return ALL_NAV_ITEMS.find((item) => isActiveHref(pathname, item.href)) ?? null;
}

/** `AuthenticatedUser.role` (agents.md §6.1), spelled out for the identity line under the brand. */
const ROLE_LABEL: Record<UserRole, string> = {
  worker: "Worker",
  hr_admin: "HR Admin",
  org_owner: "Org Owner",
  manager: "Manager",
  kayla_ops: "Kayla Ops",
  superadmin: "Superadmin",
};

/**
 * The fallback when `org_name` is null — which it is for the whole of a login-only session, since
 * `POST /auth/login` does not carry the field. Showing the product's own name is honest in a way
 * that a guessed customer name would not be.
 */
const BRAND_NAME = "Kayla Health";
const BRAND_INITIALS = "KH";

/**
 * Up to two initials from the organisation's display name, for the plum disc the design system
 * specifies ("there is no logo file, so keep it as initials"). Falls back to the product's own
 * "KH" when there is no name to draw from, or when the name is all punctuation.
 */
export function brandInitialsFor(orgName: string | null | undefined): string {
  if (orgName === null || orgName === undefined) return BRAND_INITIALS;
  const words = orgName
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length > 0);
  if (words.length === 0) return BRAND_INITIALS;
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("");
  return initials.toUpperCase();
}

/** Per-viewer convenience only (agents.md's browser-storage guidance): which state the rail
 * remembers across visits. Not a credential; never read for anything but this. */
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
 * so the paths this rail needs are inlined rather than invented). Strokes only, `currentColor`,
 * 20 pixels: agents.md §5.5.
 */
function Glyph({ children }: { readonly children: ReactElement | readonly ReactElement[] }) {
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
      {children}
    </svg>
  );
}

/** Lucide `users` — Cohorts. */
function UsersGlyph() {
  return (
    <Glyph>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Glyph>
  );
}

/** Lucide `log-out` — Sign out. */
function LogOutGlyph() {
  return (
    <Glyph>
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </Glyph>
  );
}

/** Lucide `file-text` — Knowledge Base. */
function DocumentGlyph() {
  return (
    <Glyph>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </Glyph>
  );
}

/** Lucide `list-checks` — Check-in Questions (a checklist, not any one construct's own icon). */
function ChecklistGlyph() {
  return (
    <Glyph>
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </Glyph>
  );
}

/** `Icon.jsx`'s own `layout-grid` — Overview. */
function GridGlyph() {
  return (
    <Glyph>
      <rect width={7} height={7} x={3} y={3} rx={1} />
      <rect width={7} height={7} x={14} y={3} rx={1} />
      <rect width={7} height={7} x={14} y={14} rx={1} />
      <rect width={7} height={7} x={3} y={14} rx={1} />
    </Glyph>
  );
}

/** `Icon.jsx`'s own `trending-up` — Engagement (a trend over time is what that page shows). */
function TrendingUpGlyph() {
  return (
    <Glyph>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </Glyph>
  );
}

/** `Icon.jsx`'s own `activity` — Signals: one pulse line standing in for "aggregate signal". */
function ActivityGlyph() {
  return (
    <Glyph>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Glyph>
  );
}

/** `Icon.jsx`'s own `settings` — Settings. */
function SettingsGlyph() {
  return (
    <Glyph>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  );
}

/**
 * `Icon.jsx`'s own `clipboard-check` — Actions. Deliberately not a second use of the
 * `list-checks` path: that glyph already means "a list of check-in questions" on this rail, and
 * reusing it would make two unrelated items look identical at a glance.
 */
function ClipboardCheckGlyph() {
  return (
    <Glyph>
      <rect width={8} height={4} x={8} y={2} rx={1} ry={1} />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </Glyph>
  );
}

const NAV_ICON: Readonly<Record<NavIcon, () => ReactElement>> = {
  overview: GridGlyph,
  engagement: TrendingUpGlyph,
  cohorts: UsersGlyph,
  "knowledge-base": DocumentGlyph,
  "check-in-questions": ChecklistGlyph,
  signals: ActivityGlyph,
  settings: SettingsGlyph,
  actions: ClipboardCheckGlyph,
};

/** Lucide `x` — closes the mobile drawer from inside it. */
function CloseGlyph() {
  return (
    <Glyph>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Glyph>
  );
}

/**
 * The 232-wide rail. 232 has no token of its own, so it is built from two that do
 * (64*3 + 40 = 232) rather than written as a bare literal — R5 stays a compiler-checked property
 * here, not a promise kept by eye. 64 (collapsed / icons-only) is `--spacing-64` directly.
 */
const RAIL_WIDE = "w-[calc(var(--spacing-64)*3+var(--spacing-40))]";

/**
 * The same width at `md` and up. Spelled out rather than built as `` `md:${RAIL_WIDE}` ``
 * because Tailwind generates a utility only when it finds the whole candidate as literal text in
 * a source file; an interpolated variant prefix produces the right string at runtime and no CSS
 * rule to go with it.
 */
const RAIL_WIDE_MD = "md:w-[calc(var(--spacing-64)*3+var(--spacing-40))]";

/**
 * Shared visual treatment for every rail row — nav links, Settings, Sign out. Display is
 * deliberately left out so each call site can pick it; every row is `flex` today, but keeping
 * `display` out of a shared string is what stopped two of them fighting over it before.
 */
function railItemClass(collapsed: boolean, active: boolean): string {
  return [
    "min-h-48 items-center rounded-control font-core transition-colors",
    "duration-[var(--duration-fast)] ease-standard",
    "focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum",
    // The drawer (base) is always the expanded shape — there is no such thing as an icons-only
    // overlay. From `md` up the remembered preference decides, which is the whole point of
    // moving the control onto the mark: a toggle that only bit at `lg` was a toggle most
    // people never saw work.
    "w-full justify-start gap-12 px-12",
    collapsed ? "md:w-48 md:justify-center md:gap-[0] md:px-[0]" : "",
    active
      ? "bg-surface-plum-tint font-bold text-text-link"
      : "font-medium text-text-secondary hover:bg-surface-warm-gray",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

/**
 * A row's label. Always in the DOM; visually hidden exactly where the rail is icons-only — never
 * dropped, because an icon with no accessible name is not a link, it is a puzzle. Seven tests
 * look these labels up by name (`getByRole("link", { name: "Knowledge Base" })`), and `sr-only`
 * still contributes an accessible name where `aria-hidden` or removal would not.
 */
function railLabelClass(collapsed: boolean): string {
  return ["whitespace-nowrap text-label", collapsed ? "md:sr-only" : ""]
    .filter((part) => part.length > 0)
    .join(" ");
}

export function SidebarNav({ user, mobileOpen = false, onMobileClose }: SidebarNavProps) {
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

  /**
   * Sign out: tell the server first, then forget locally, then leave.
   *
   * This used to be `clearSession()` and a redirect, and nothing else — which was a real gap even
   * before the cookie existed: the access token stayed valid for up to fifteen more minutes, and
   * nothing on the server ever learned the session had ended. Now it is worse than a gap, because
   * the durable credential is an `HttpOnly` cookie this code *cannot* clear. Only
   * `POST /auth/logout` can expire it, and only with the exact `Path`/`SameSite`/`Secure` triple
   * `kayla.auth.cookies` used to set it.
   *
   * `sendSessionCookie` is on so the browser accepts that expiry. No `refresh_token` is sent, and
   * the field stays optional in the contract for exactly that reason: this app has never been able
   * to read the cookie, so it has nothing to name.
   *
   * The local half runs in `finally`, and that ordering is the point: whether the server answered
   * `200`, `401` (the token had already expired) or nothing at all (the API is unreachable), a
   * person who clicked "Sign out" must end up signed out of this tab and on the login page. A
   * failed network call is not a reason to leave someone's dashboard on screen.
   */
  async function signOut() {
    try {
      await apiRequest("post", "/auth/logout", { body: {}, sendSessionCookie: true });
    } catch {
      // Deliberately swallowed — see the docstring. Nothing a person can act on, and nothing that
      // should stop them leaving.
    } finally {
      clearSession();
      router.replace(LOGIN_ROUTE);
    }
  }

  function handleSignOut() {
    void signOut();
  }

  const orgName = user.org_name ?? null;

  function renderNavLink(item: NavItem) {
    const active = isActiveHref(pathname, item.href);
    const Icon = NAV_ICON[item.icon];
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onMobileClose}
        className={`flex ${railItemClass(collapsed, active)}`}
      >
        <Icon />
        <span className={railLabelClass(collapsed)}>{item.label}</span>
      </Link>
    );
  }

  return (
    <>
      {/* Dismiss layer. Rendered only while the drawer is open, and only below md — above that
          the rail is part of the page and there is nothing to dismiss. */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onMobileClose}
          className="fixed top-[0] right-[0] bottom-[0] left-[0] z-40 bg-text-primary opacity-60 md:hidden"
        />
      ) : null}

      <nav
        aria-label="Kayla Health dashboard"
        className={[
          // Flush to the viewport edge and full height: the rail *is* the left edge of the
          // application now, not a floating card sitting on a padded page. So: no outer radius,
          // no drop shadow, and one hairline on the side that meets the content.
          "flex-col justify-between border-r border-hairline-sidebar bg-surface-sidebar py-24",
          // Below md the rail is either an overlay or genuinely absent — never merely shifted
          // off-screen, which would leave its links in the tab order behind the page.
          mobileOpen
            ? `fixed top-[0] bottom-[0] left-[0] z-50 flex ${RAIL_WIDE} items-stretch overflow-y-auto px-12 shadow-panel`
            : "hidden md:flex",
          // From md up the rail is static and the remembered preference decides its width.
          "md:static md:h-full md:overflow-visible",
          collapsed
            ? "md:w-64 md:items-center md:px-[0]"
            : `${RAIL_WIDE_MD} md:items-stretch md:px-12`,
        ]
          .filter((part) => part.length > 0)
          .join(" ")}
      >
        <div className="flex flex-col gap-24">
          <div
            className={[
              "flex items-center gap-12 justify-start px-4",
              collapsed ? "md:justify-center md:px-[0]" : "",
            ]
              .filter((part) => part.length > 0)
              .join(" ")}
          >
            {/*
              The app mark, and the control that collapses the rail — one element, because that
              is the affordance a person reaches for. The old control was a chevron row pinned in
              the footer, below Settings and Sign out, visible only at `lg`: a long way from the
              thing it acted on, and invisible at the width where a narrow rail helps most.

              It wraps the mark *only*, not the organisation name beside it. Wrapping both would
              make the button's accessible name the customer's name — "Okemah Community Care,
              button" — which says nothing about what pressing it does. The identity stays text;
              the control keeps a name that is a verb.

              `aria-expanded` describes the rail this button controls, so the state is announced
              rather than inferred from a label that happens to change.
            */}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              className="flex size-48 shrink-0 items-center justify-center rounded-control transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-warm-gray focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum"
            >
              <BrandMark size="md" />
            </button>
            <div
              className={[
                "flex min-w-[0] flex-col gap-4",
                collapsed ? "md:sr-only" : "",
              ]
                .filter((part) => part.length > 0)
                .join(" ")}
            >
              <span className="truncate text-label font-extrabold text-text-primary">
                {orgName ?? BRAND_NAME}
              </span>
              <span className="truncate text-meta font-medium text-text-tertiary">
                {user.email} · {ROLE_LABEL[user.role]}
              </span>
            </div>
            {/* Rendered only while the drawer is actually open — not merely hidden by CSS. A
                permanently-present-but-invisible control is still in the tab order at every
                breakpoint where it does nothing. The backdrop is the other way out. */}
            {mobileOpen ? (
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close navigation"
                className="ml-auto flex size-48 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-warm-gray focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum md:hidden"
              >
                <CloseGlyph />
              </button>
            ) : null}
          </div>

          <ul className="flex list-none flex-col gap-4 p-[0]">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>{renderNavLink(item)}</li>
            ))}
          </ul>
        </div>

        {/* Footer, pinned to the bottom by the root's `justify-between` —
            `SidebarNavigation.prompt.md`: "Footer items (Settings, Sign out) pin to the bottom." */}
        <ul className="flex list-none flex-col gap-4 p-[0]">
          <li>{renderNavLink(SETTINGS_ITEM)}</li>
          <li>
            <button
              type="button"
              onClick={handleSignOut}
              className={`flex ${railItemClass(collapsed, false)}`}
            >
              <LogOutGlyph />
              <span className={railLabelClass(collapsed)}>Sign out</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

export default SidebarNav;
