"use client";

/**
 * `/knowledge-base/upload` — the real Knowledge Base document upload (agents.md §10.5 tasks
 * 1–2).
 *
 * All the behaviour lives in `KbUploadFlow`; this file is page chrome — a heading and a link
 * back to the document list — exactly the role `UploadRosterPage` plays for `RosterUploadFlow`.
 *
 * The `AppPage` frame is the same one every dashboard screen uses, so the header sits at the same
 * left edge and the same height as the list this page was reached from. `width="form"` caps the
 * *body* at a form's natural measure — a file input stretched across a wide display is absurd —
 * while leaving the chrome identical. The page used to cap the whole thing at a narrower width
 * than its own list screen, so arriving here nudged everything sideways.
 */

import { KbUploadFlow } from "@/components/kb-upload-flow";
import { AppPage } from "@/components/ui/app-page";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadKbDocumentPage() {
  return (
    <AppPage
      width="form"
      header={
        <PageHeader
          backLink={{ href: "/knowledge-base", label: "← Back to Knowledge Base" }}
          eyebrow="Knowledge Base"
          title="Upload document"
          description="Kayla reads this document to answer employee questions, always citing the section it drew from. Nothing here should contain individual employee records — Kayla flags documents that look like they do."
        />
      }
    >
      <KbUploadFlow />
    </AppPage>
  );
}
