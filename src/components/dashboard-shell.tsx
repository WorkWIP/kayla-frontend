"use client";

/**
 * The authenticated HR dashboard shell (agents.md §10.3 task 7).
 *
 * Every dashboard screen renders as `children` inside this shell via
 * `src/app/(dashboard)/layout.tsx`. It owns three jobs:
 *
 * 1. Answer the three-state boot from `useAuthenticatedSession` (`src/lib/session.ts`): render
 *    nothing for someone who is definitely signed out, a neutral skeleton while the session is
 *    being restored from the backend's cookie, and the real chrome once there is a session.
 * 2. Lay out the rail (`SidebarNav`) beside the page content.
 * 3. Own the one piece of state the rail cannot own for itself: whether the mobile drawer is
 *    open. The control that opens it is the top bar's hamburger, which is outside the drawer.
 *
 * --------------------------------------------------------------------------------------------
 * An app frame, not a padded page
 * --------------------------------------------------------------------------------------------
 * This used to be a page with a floating rail on it: the whole thing sat inside `p-24`, the rail
 * was a rounded card with a gap beside it, and the frame grew with `min-h-screen` so the browser
 * scrolled the document. Every screen then re-capped itself at `max-w-5xl` on top of that, and a
 * wide display ended up with a narrow ribbon of content between two empty margins.
 *
 * It is now an application frame:
 *
 *   `h-dvh overflow-hidden`  the frame is exactly the viewport and never scrolls itself
 *   rail flush to the edge   no outer padding, no gap — the rail *is* the left edge
 *   only `<main>` scrolls    so the rail and the top bar stay put, and a page's own sticky
 *                            header (see `ui/app-page.tsx`) has something to stick to
 *
 * `h-dvh` rather than `h-screen`: on mobile Safari and Chrome `100vh` is the viewport *with the
 * URL bar hidden*, so a `h-screen` frame is taller than the visible area and the bottom of every
 * page sits under the browser chrome until you scroll. `dvh` tracks the bar as it retracts.
 *
 * --------------------------------------------------------------------------------------------
 * The top bar carries page context, and nothing else
 * --------------------------------------------------------------------------------------------
 * No account menu, no avatar, no sign-out. The design system puts Settings and Sign out in the
 * sidebar footer (`SidebarNavigation.prompt.md`: "Footer items (Settings, Sign out) pin to the
 * bottom"), and an action that exists in two places is an action a person has to check twice.
 * What is here instead is the one thing the rail cannot show at every breakpoint: where you are
 * — because below `md` the rail is off-canvas and the only clue to the current page would
 * otherwise be the page's own `<h1>`, which can be scrolled off.
 *
 * **There is deliberately no global search box here**, although a persistent search is the most
 * repeated recommendation in the healthcare-UI survey this redesign follows. Nothing in this
 * backend answers a cross-entity query — there is no endpoint a top-bar search could call — and
 * a control that looks like search but only searches the screen you happen to be on is worse
 * than no control. Search is therefore real and per-screen, in each page's own toolbar, over
 * data the page already holds. When a search endpoint exists, this is where it goes.
 *
 * The section name is read from the URL through `findActiveNavItem`, the same function the rail
 * uses for `aria-current`, so the two can never disagree about which page is current.
 *
 * `aria-hidden` on the section name: it duplicates the page's own `<h1>` a few hundred pixels
 * below it, and a screen reader reading the same words twice in a row is noise, not context.
 *
 * The organisation's name is deliberately *not* repeated here. The rail already shows it, and
 * `dashboard-shell.test.tsx` reads it with a singular `getByText` — one name, in one place.
 *
 * --------------------------------------------------------------------------------------------
 * Why "signed out" and "not yet" render differently
 * --------------------------------------------------------------------------------------------
 * This component used to return `null` whenever the session was null, and that was right while the
 * session read was synchronous: null meant signed out, the redirect to `/login` was already in
 * flight, and rendering nothing for one frame was better than flashing chrome that was about to be
 * replaced. A loading state would have been visible for exactly the instant this dashboard must
 * not be.
 *
 * A reload now restores the session over the network, so null-for-a-moment is the *normal* state of
 * a signed-in person who pressed refresh. Treating it as "signed out" would show them the login
 * page every single time. So the two are separated: `signed-out` still renders nothing and lets the
 * redirect land, and `restoring` renders the shell's outer frame with a `PageSkeleton` in place of
 * the page — no rail, no navigation, no org name, nothing that would be a lie if the restore fails,
 * and no visual jump when it succeeds.
 *
 * A skeleton rather than a spinner, per `src/components/ui/skeleton.tsx`: it pre-draws the layout
 * that is about to arrive instead of animating in place, and it carries the one `role="status"`
 * announcement a screen reader needs while a sighted user gets the shape of the page. Exactly one:
 * a second live region in this frame would make `getByRole("status")` ambiguous for every page
 * test that waits on it.
 */

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { SidebarNav, findActiveNavItem } from "@/components/sidebar-nav";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useAuthenticatedSession } from "@/lib/session";

export interface DashboardShellProps {
  readonly children: ReactNode;
}

/** The outer frame, shared verbatim by the restoring and the signed-in states so that the
 *  transition between them is a fill-in rather than a re-layout. */
const FRAME_CLASS = "flex h-dvh w-full overflow-hidden bg-surface-page";

/** The top bar. A real bar now rather than a hairline strip, but still only context. */
const TOP_BAR_CLASS =
  "flex min-h-64 shrink-0 items-center gap-12 border-b border-hairline-lilac bg-surface-card px-16 lg:px-24";

function MenuGlyph() {
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
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

/**
 * The frame, with no rail and no page — what a reload draws while the session is being restored.
 *
 * Everything identifying is absent: the rail would have to invent an organisation name and a set
 * of destinations for someone who may turn out not to be signed in at all.
 */
function RestoringShell() {
  return (
    <div className={FRAME_CLASS}>
      <div className="flex min-w-[0] flex-1 flex-col overflow-hidden">
        <header className={TOP_BAR_CLASS} />
        <main className="min-w-[0] flex-1 overflow-y-auto p-24 lg:p-32">
          <PageSkeleton label="Loading your dashboard…" shape="grid" />
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const sessionState = useAuthenticatedSession();
  const pathname = usePathname();
  /**
   * Whether the `< md` drawer is open, and the URL it was opened on.
   *
   * Navigating is a dismissal: leaving the drawer open over the page you just asked for is the
   * single most common mobile-drawer bug. `SidebarNav` already closes it when one of its own
   * links is clicked, but that does not cover the browser's Back button, so the pathname it was
   * opened at is carried alongside it and the mismatch is reconciled *during render* — React's
   * own "adjusting state when a prop changes" pattern, not an effect. An effect here would mean
   * a committed render with the drawer still over the new page, which is exactly the frame this
   * is trying to avoid.
   */
  const [drawer, setDrawer] = useState<{ readonly open: boolean; readonly at: string }>({
    open: false,
    at: pathname,
  });
  if (drawer.open && drawer.at !== pathname) {
    setDrawer({ open: false, at: pathname });
  }
  const mobileNavOpen = drawer.open;

  // "We are asking" is not "no". Rendering nothing here — which is what this did while the session
  // read was synchronous — would flash an empty page on every legitimate reload; redirecting here
  // would flash the *login* page, which is worse. Neutral chrome, and no decision, until the answer
  // arrives. See the module docstring.
  if (sessionState.status === "restoring") {
    return <RestoringShell />;
  }

  // Definitely signed out. `useAuthenticatedSession` has already started the redirect to `/login`;
  // this component's job is to not flash the sidebar and an empty page before it lands.
  if (sessionState.status === "signed-out") {
    return null;
  }

  const session = sessionState.session;
  const activeItem = findActiveNavItem(pathname);

  return (
    <div className={FRAME_CLASS}>
      <SidebarNav
        user={session.user}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setDrawer({ open: false, at: pathname })}
      />
      <div className="flex min-w-[0] flex-1 flex-col overflow-hidden">
        <header className={TOP_BAR_CLASS}>
          <button
            type="button"
            onClick={() => setDrawer({ open: true, at: pathname })}
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            className="flex size-48 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-warm-gray focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum md:hidden"
          >
            <MenuGlyph />
          </button>
          {/* A trail, not a title: the product, then where in it you are. The page's own `<h1>`
              says the same thing louder a moment below, which is why the whole line is hidden
              from assistive technology rather than read out twice. */}
          <p aria-hidden="true" className="flex min-w-[0] items-center gap-8">
            <span className="shrink-0 text-eyebrow font-bold uppercase tracking-eyebrow text-text-tertiary">
              Kayla Health
            </span>
            {activeItem === null ? null : (
              <>
                <span className="shrink-0 text-text-tertiary">/</span>
                <span className="truncate text-label font-bold text-text-primary">
                  {activeItem.label}
                </span>
              </>
            )}
          </p>
        </header>
        {/* The only scrolling region in the application. */}
        <main className="min-w-[0] flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export default DashboardShell;
