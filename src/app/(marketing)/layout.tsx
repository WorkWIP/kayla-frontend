import type { ReactNode } from "react";

/**
 * Layout for the public, unauthenticated surfaces: the landing page at `/` and the organisation
 * signup flow under `/signup`.
 *
 * --------------------------------------------------------------------------------------------
 * What this route group exists to keep out
 * --------------------------------------------------------------------------------------------
 * `(dashboard)/layout.tsx` wraps its children in `<DashboardShell>`, which calls
 * `useAuthenticatedSession()` and redirects to `/login` when there is none. Every route in this
 * group is reached by someone who by definition has no session — a visitor who has never heard
 * of the product, or a buyer part-way through creating an organisation that does not exist yet.
 * Putting them in their own group is what keeps that shell, and that redirect, off them.
 *
 * It is also the reason this file is not a Client Component and has no `"use client"` anywhere
 * above it. `/` is the product's public front door: it has to be linkable and indexable, which
 * means real `metadata` rendered on the server, not a shell that boots and then paints.
 *
 * The chrome here is deliberately almost nothing — a single centred column. `DashboardShell`'s
 * rail, top bar and section context are all answers to "where am I in an application I am
 * signed into", and none of those questions applies on a page whose job is to explain what the
 * application is.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen w-full flex-col bg-surface-page">{children}</div>;
}
