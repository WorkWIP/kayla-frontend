"use client";

/**
 * The authenticated HR dashboard shell (agents.md §10.3 task 7).
 *
 * Every dashboard screen — Cohorts today, whatever P9–P12 add later — renders as `children`
 * inside this shell via `src/app/(dashboard)/layout.tsx`. It owns exactly two jobs:
 *
 * 1. Refuse to render dashboard chrome for anyone without a session (`useAuthenticatedSession`
 *    from `src/lib/session.ts` already kicked off the redirect to `/login`; this component's
 *    job is just to not flash the sidebar and an empty page in the moment before that redirect
 *    lands).
 * 2. Lay out the rail (`SidebarNav`) beside the page content.
 *
 * It has no opinion on what a screen looks like beyond that — no page title, no breadcrumbs, no
 * per-screen chrome. Those belong to the screens themselves (Cohorts, and later ones), not to a
 * shell every one of them shares.
 */

import type { ReactNode } from "react";

import { SidebarNav } from "@/components/sidebar-nav";
import { useAuthenticatedSession } from "@/lib/session";

export interface DashboardShellProps {
  readonly children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const session = useAuthenticatedSession();

  // `null` means either "definitely signed out" or "the redirect to /login has not committed
  // yet" — both render the same way here: nothing. A loading spinner or a placeholder shell
  // would be visible for exactly the instant this dashboard must not be, so rendering nothing
  // is the correct behaviour, not a missing loading state.
  if (session === null) {
    return null;
  }

  return (
    <div className="flex min-h-screen w-full items-stretch gap-24 bg-surface-page p-24">
      <SidebarNav user={session.user} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export default DashboardShell;
