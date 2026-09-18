import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard-shell";

/**
 * Layout for every authenticated HR dashboard route (agents.md §10.3 task 7).
 *
 * `/login` and anything else unauthenticated live outside this route group. Everything under
 * `(dashboard)` — `/cohorts` in this phase, more in later ones — renders inside
 * `<DashboardShell>`, which is where the session check and the sidebar actually live. This file
 * stays a thin wrapper on purpose: it has no client-only logic of its own, so it does not need
 * `"use client"`.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
