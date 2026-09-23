"use client";

/**
 * Client-side session guard for the authenticated dashboard shell (agents.md §10.3 task 7).
 *
 * This module does not hold a session of its own — `src/api/client.ts` already does that,
 * deliberately in a module-scoped variable and nowhere else (see the `SESSION` docstring
 * there). Duplicating that store here would give the app two answers to "am I signed in?"
 * that could drift apart. This file only *reads* that store, asks it once to restore itself
 * from the backend's cookie, and turns "no session" into a redirect — which is the piece
 * `client.ts` cannot own: it is API-shaped and knows nothing about routes.
 *
 * --------------------------------------------------------------------------------------------
 * Why this is three states and not two
 * --------------------------------------------------------------------------------------------
 * It used to be two, and that was correct while the read was synchronous: `getSession()` either
 * had a session or it did not, and "not" meant "signed out", so the shell could redirect on the
 * spot and render nothing in the meantime.
 *
 * Restoring from a cookie is a network round trip, so "not yet" is now a third, real answer, and
 * collapsing it into "signed out" would redirect to `/login` on **every legitimate reload** —
 * flashing the sign-in page at someone who is signed in, and racing the restore that was about to
 * succeed. The three states are therefore explicit:
 *
 *   restoring   we are asking; render neutral chrome, redirect nowhere, decide nothing
 *   signed-in   a session is in memory; render the dashboard
 *   signed-out  we asked and there is nothing; redirect to /login
 *
 * A session already in memory — the ordinary case, one client-side navigation after signing in —
 * skips `restoring` entirely: the initial state is computed from `getSession()` during the first
 * render, so there is no frame in which a signed-in person sees a skeleton.
 *
 * The restore runs **once per mount**, guarded by a ref rather than by the effect's dependency
 * list, because React Strict Mode mounts an effect twice in development and two concurrent calls
 * to `POST /auth/session` would rotate the same cookie twice — the second one presenting a token
 * the first had already spent, which is reuse detection's definition of a stolen token and would
 * revoke the whole family. One call, once, is not an optimisation here; it is correctness.
 *
 * --------------------------------------------------------------------------------------------
 * What the restore can and cannot recover, unchanged from before
 * --------------------------------------------------------------------------------------------
 * The access token still lives in memory only, and this module still does not go looking for one
 * in `localStorage`. What a reload recovers is a *new* access token, minted by the backend from an
 * `HttpOnly` cookie this code cannot read, through `POST /auth/session` — whose response carries no
 * refresh token, so nothing durable ever enters this bundle. A person with no cookie (a first
 * visit, a cleared jar, a seven-day-old cookie) is signed out exactly as they were before, and the
 * redirect below is still the correct answer for them.
 *
 * The second, older limitation is also unchanged: this hook only re-evaluates when the component
 * calling it re-renders, so it will not notice a session that expires while the person stays on one
 * client-side route. Anything that ends a session explicitly (e.g. "Sign out") must still tell the
 * server, clear the session and navigate itself rather than rely on this hook to notice — see
 * `sidebar-nav.tsx`.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getSession, restoreSessionOnce, subscribeToSessionChanges } from "@/api/client";
import type { ActiveSession } from "@/api/client";

/** Where an unauthenticated visitor to a dashboard route is sent. */
export const LOGIN_ROUTE = "/login";

/**
 * The three answers to "am I signed in?", as a discriminated union.
 *
 * A union rather than `ActiveSession | null` plus a boolean: two independent fields have four
 * combinations, two of which are nonsense ("restoring, and here is the session"), and the whole
 * point of this change is that the caller must not be able to treat "not yet" as "no".
 */
export type SessionState =
  | { readonly status: "restoring" }
  | { readonly status: "signed-in"; readonly session: ActiveSession }
  | { readonly status: "signed-out" };

const RESTORING: SessionState = { status: "restoring" };
const SIGNED_OUT: SessionState = { status: "signed-out" };

function fromStore(): SessionState {
  const session = getSession();
  return session === null ? RESTORING : { status: "signed-in", session };
}

/**
 * The session state for the authenticated shell, restoring it from the backend's cookie if needed.
 *
 * Call this once, near the top of the authenticated shell (`dashboard-shell.tsx`), not in every
 * screen beneath it — the restore is a network call and the redirect is a side effect, and firing
 * either from several places at once is harder to reason about than firing it from exactly one.
 */
export function useAuthenticatedSession(): SessionState {
  const router = useRouter();
  // Computed during the first render, not in an effect: a session that is already in memory must
  // never produce a `restoring` frame, or every client-side navigation into the dashboard would
  // flash a skeleton over a page that was ready to draw.
  const [state, setState] = useState<SessionState>(fromStore);

  useEffect(() => {
    if (state.status !== "restoring") return;

    // Always subscribe. `restoreSessionOnce` is what keeps this to a single `POST /auth/session`,
    // so a second mount joins the request already in flight instead of either starting another
    // one (which would spend a cookie twice) or — the bug this replaced — subscribing to nothing
    // and leaving the shell loading forever. See that function for the full sequence.
    let live = true;
    void restoreSessionOnce().then((session) => {
      if (!live) return;
      setState(session === null ? SIGNED_OUT : { status: "signed-in", session });
    });
    return () => {
      live = false;
    };
  }, [state.status]);

  useEffect(() => {
    if (state.status === "signed-out") {
      router.replace(LOGIN_ROUTE);
    }
  }, [state.status, router]);

  /**
   * Keep `state.session` in step with `SESSION` while signed in (whitelabel Phase 2).
   *
   * `SESSION` (`src/api/client.ts`) is a plain module variable, not React state — `setState`
   * above only ever runs it through this hook's own two call sites (adopting a restore, or the
   * initial `fromStore()` read). A Settings-page branding save calls `updateSessionUser` directly
   * on that module variable while this hook's `state` is already sitting in `signed-in` from an
   * earlier render, and without this subscription nothing would tell this component to read it
   * again — the sidebar/tab-title would keep the stale name/logo until a full remount (a
   * navigation from outside the dashboard, or a reload). This closes exactly that gap: the org
   * owner's own edit reaches the rail immediately, mid-session, with no navigation required.
   */
  useEffect(() => {
    if (state.status !== "signed-in") return;
    return subscribeToSessionChanges(() => {
      const latest = getSession();
      // `null` (a sign-out racing this subscription) is left alone rather than forced into
      // `signed-out` here — `clearSession`'s own callers already own navigating away, and this
      // effect's only job is keeping a *session that still exists* fresh, not re-deciding whether
      // one does.
      if (latest !== null) setState({ status: "signed-in", session: latest });
    });
  }, [state.status]);

  return state;
}
