"use client";

/**
 * `/knowledge-base/upload` — the real Knowledge Base document upload (agents.md §10.5 tasks
 * 1–2).
 *
 * All the behaviour lives in `KbUploadFlow`; this file is page chrome — a heading and a link
 * back to the document list — exactly the role `UploadRosterPage` plays for `RosterUploadFlow`.
 */

import { KbUploadFlow } from "@/components/kb-upload-flow";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadKbDocumentPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-24 p-32">
      <PageHeader
        backLink={{ href: "/knowledge-base", label: "← Back to Knowledge Base" }}
        eyebrow="Knowledge Base"
        title="Upload document"
        description="Kayla reads this document to answer employee questions, always citing the section it drew from. Nothing here should contain individual employee records — Kayla flags documents that look like they do."
      />

      <KbUploadFlow />
    </div>
  );
}
