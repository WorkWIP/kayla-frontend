"use client";

/**
 * `/knowledge-base/upload` — the real Knowledge Base document upload (agents.md §10.5 tasks
 * 1–2).
 *
 * All the behaviour lives in `KbUploadFlow`; this file is page chrome — a heading and a link
 * back to the document list — exactly the role `UploadRosterPage` plays for `RosterUploadFlow`.
 */

import Link from "next/link";

import { KbUploadFlow } from "@/components/kb-upload-flow";

export default function UploadKbDocumentPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-24 p-32">
      <div className="flex flex-col gap-8">
        <Link
          href="/knowledge-base"
          className="w-fit text-label font-medium text-text-link underline underline-offset-2"
        >
          ← Back to Knowledge Base
        </Link>
        <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
          Knowledge Base
        </p>
        <h1 className="text-display-2 text-text-primary">Upload document</h1>
        <p className="max-w-md text-body text-text-secondary">
          Kayla reads this document to answer employee questions, always citing the section it
          drew from. Nothing here should contain individual employee records — Kayla flags
          documents that look like they do.
        </p>
      </div>

      <KbUploadFlow />
    </div>
  );
}
