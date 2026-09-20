"use client";

/**
 * `/cohorts/upload` — the real CSV roster upload (agents.md §10.3 tasks 3–5,
 * `kb/MVP-SPEC.md` §2.1.1 / §3.4).
 *
 * All the behaviour lives in `RosterUploadFlow`; this file is page chrome — a heading and a
 * link back to the cohort list — exactly the role `DashboardPageHeader` played in the demo's
 * `CohortsScreen.tsx` "upload" view.
 *
 * The `AppPage` frame is the same one every dashboard screen uses, so the header sits at the same
 * left edge and the same height as the list this page was reached from. `width="form"` caps the
 * *body* at a form's natural measure — a file input stretched across a wide display is absurd —
 * while leaving the chrome identical. The page used to cap the whole thing at a narrower width
 * than its own list screen, so arriving here nudged everything sideways.
 */

import { RosterUploadFlow } from "@/components/roster-upload-flow";
import { AppPage } from "@/components/ui/app-page";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadRosterPage() {
  return (
    <AppPage
      width="form"
      header={
        <PageHeader
          backLink={{ href: "/cohorts", label: "← Back to cohorts" }}
          eyebrow="Cohorts"
          title="Upload roster"
          description="A second upload updates the existing roster by email — it never creates a duplicate, and a worker missing from this file is never removed."
        />
      }
    >
      <RosterUploadFlow />
    </AppPage>
  );
}
