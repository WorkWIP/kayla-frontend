"use client";

/**
 * `/cohorts/upload` — the real CSV roster upload (agents.md §10.3 tasks 3–5,
 * `kb/MVP-SPEC.md` §2.1.1 / §3.4).
 *
 * All the behaviour lives in `RosterUploadFlow`; this file is page chrome — a heading and a
 * link back to the cohort list — exactly the role `DashboardPageHeader` played in the demo's
 * `CohortsScreen.tsx` "upload" view.
 */

import Link from "next/link";

import { RosterUploadFlow } from "@/components/roster-upload-flow";

export default function UploadRosterPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-24 p-32">
      <div className="flex flex-col gap-8">
        <Link
          href="/cohorts"
          className="w-fit text-label font-medium text-text-link underline underline-offset-2"
        >
          ← Back to cohorts
        </Link>
        <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
          Cohorts
        </p>
        <h1 className="text-display-2 text-text-primary">Upload roster</h1>
        <p className="max-w-md text-body text-text-secondary">
          A second upload updates the existing roster by email — it never creates a duplicate,
          and a worker missing from this file is never removed.
        </p>
      </div>

      <RosterUploadFlow />
    </div>
  );
}
