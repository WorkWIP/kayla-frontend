"use client";

/**
 * Client-side session guard for the authenticated dashboard shell (agents.md §10.3 task 7).
 *
 * This module does not hold a session of its own — `src/api/client.ts` already does that,
 * deliberately in a module-scoped variable and nowhere else (see the `SESSION` docstring
 * there). Duplicating that store here would give the app two answers to "am I signed in?"
 * that could drift apart. This file only *reads* that store and turns "no session" into a
 * redirect, which is the one piece `client.ts` cannot own: it is API-shaped and knows
 * nothing about routes.
 *
 * --------------------------------------------------------------------------------------------
 * Known limitation, by design, not an oversight
 * --------------------------------------------------------------------------------------------
 * The access token lives in memory only (never `localStorage`, per P1's reconciliation — see
 * `client.ts`). A full page reload therefore always signs the user out, even mid-session: there
 * is no refresh-token bootstrap wired into the dashboard yet, and the browser has no safe place
 * to keep one anyway. `useAuthenticatedSession` reflects that honestly — it does not try to
 * recover a session from storage or a cookie the backend never sets. The redirect below on a
 * missing session is therefore the *correct* behaviour after a reload, not a bug to route
 * around with a mechanism this phase was not asked to build.
 *
 * A second, related limitation: because this hook only re-evaluates when the component that
 * calls it re-renders for some other reason, it will not notice a session that expires while
 * the person stays on the same client-side route. Anything that ends a session explicitly
 * (e.g. "Sign out") must call `clearSession()` *and* navigate to `/login` itself rather than
 * rely on this hook to notice — see `sidebar-nav.tsx`.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getSession } from "@/api/client";
import type { Session } from "@/api/client";

/** Where an unauthenticated visitor to a dashboard route is sent. */
export const LOGIN_ROUTE = "/login";

/**
 * The current session, or `null` while a redirect to `/login` is in flight.
 *
 * Call this once, near the top of the authenticated shell (`dashboard-shell.tsx`), not in every
 * screen beneath it — the redirect is a side effect and firing it from several places at once
 * is harder to reason about than firing it from exactly one.
 */
export function useAuthenticatedSession(): Session | null {
  const router = useRouter();

  // A plain read, not React state: `client.ts` is the single source of truth for the session,
  // and mirroring it into `useState` would be a second copy that could disagree with the first
  // the moment something (e.g. `clearSession()`) changes the original without going through
  // this hook.
  const session = getSession();

  useEffect(() => {
    if (session === null) {
      router.replace(LOGIN_ROUTE);
    }
  }, [session, router]);

  return session;
}
