"use client";

/**
 * `/cohorts/upload` — the real CSV roster upload (agents.md §10.3 tasks 3–5,
 * `kb/MVP-SPEC.md` §2.1.1 / §3.4).
 *
 * All the behaviour lives in `RosterUploadFlow`; this file is page chrome — a heading and a
 * link back to the cohort list — exactly the role `DashboardPageHeader` played in the demo's
 * `CohortsScreen.tsx` "upload" view.
 */

import { RosterUploadFlow } from "@/components/roster-upload-flow";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadRosterPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-24 p-32">
      <PageHeader
        backLink={{ href: "/cohorts", label: "← Back to cohorts" }}
        eyebrow="Cohorts"
        title="Upload roster"
        description="A second upload updates the existing roster by email — it never creates a duplicate, and a worker missing from this file is never removed."
      />

      <RosterUploadFlow />
    </div>
  );
}
