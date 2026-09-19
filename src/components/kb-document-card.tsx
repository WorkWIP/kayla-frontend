/**
 * One Knowledge Base document as a card on `/knowledge-base` (agents.md §10.5 task 13,
 * `kb/MVP-SPEC.md` §3.7 Q-51, `kb/notes/RAG.md` §8).
 *
 * --------------------------------------------------------------------------------------------
 * `status_display` is rendered verbatim — this file does not generate Q-51's copy itself
 * --------------------------------------------------------------------------------------------
 * `kayla.kb.router._render_status_display` (read directly from the concurrently-built backend —
 * see `KbDocument` below) computes Q-51's exact string server-side, including the two rows that
 * need a real number (`Indexed - N sections`'s chunk count, `Replaced by v-N`'s superseding
 * version) — both of which require queries this UI has no way to run itself
 * (`kb_active_chunks`, the other current row for this title). So this component's whole job for
 * the label is to display `status_display` unchanged; duplicating that string-building logic
 * here would be a second, driftable copy of the one place agents.md §10.5 task 13 actually needs
 * to be correct. `status` (the machine enum, not the display string) is what this file uses for
 * everything *else* Q-51 does not specify: which colour tint a badge gets, and which statuses
 * are still in flight (`isKbDocumentTerminal`, used by `/knowledge-base`'s poll loop).
 */

export type KbDocumentStatus =
  | "uploaded"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexed"
  | "failed_unsupported_format"
  | "failed_too_large"
  | "failed_encrypted"
  | "failed_no_text_layer"
  | "failed_parse_error"
  | "quarantined_injection"
  | "superseded";

/**
 * One row of `GET /kb/documents` (`kayla.kb.schemas.KbDocumentSummary`, read directly from the
 * concurrently-built backend router/schemas as of this writing). Not sourced from
 * `src/api/generated.ts` yet — `kayla-backend/openapi.json` has not been regenerated against
 * `kayla.kb.router` at the time this file was written, so `npm run codegen` cannot yet produce
 * `paths["/kb/documents"]`. Regenerating `openapi.json` is outside this task's file ownership
 * (backend-owned); the next `npm run codegen` run after it lands should replace this
 * hand-written interface with a generated one and delete this paragraph.
 */
export interface KbDocument {
  readonly id: string;
  readonly title: string;
  readonly filename: string;
  readonly version: number;
  readonly status: KbDocumentStatus;
  /** Q-51's exact copy for `status`, already rendered server-side — see the module docstring. */
  readonly status_display: string;
  readonly page_count: number | null;
  /** Null for the current version; set the instant a newer version replaced this one. */
  readonly superseded_at: string | null;
  readonly uploaded_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/** `parsing` / `chunking` / `embedding` collapse to one "Processing" row in Q-51's own table —
 * `kayla.kb.models.KbDocumentStatus`'s own docstring documents this as 12 machine states behind
 * 10 display rows for exactly this reason. */
const NON_TERMINAL_STATUSES: readonly KbDocumentStatus[] = [
  "uploaded",
  "parsing",
  "chunking",
  "embedding",
];

/** Whether a document has reached one of Q-51's terminal rows (everything except the three
 * in-flight machine states). Exported so `/knowledge-base`'s poll loop can decide, without
 * duplicating this table, when nothing left on the page can still change. */
export function isKbDocumentTerminal(status: KbDocumentStatus): boolean {
  return !NON_TERMINAL_STATUSES.includes(status);
}

/** Colour is never the only signal here (agents.md §5.5) — `status_display`'s text is the real
 * signal; the tint is a reinforcement, keyed off the machine status rather than parsed back out
 * of the display string. */
const STATUS_TONE: Readonly<Record<KbDocumentStatus, BadgeTone>> = {
  uploaded: "neutral",
  parsing: "attention",
  chunking: "attention",
  embedding: "attention",
  indexed: "positive",
  failed_unsupported_format: "critical",
  failed_too_large: "critical",
  failed_encrypted: "critical",
  // Auto-retrying is a real difference from the other failures — it is not a dead end the way
  // "Something went wrong" is — so this stays the in-progress tone, not critical.
  failed_no_text_layer: "attention",
  failed_parse_error: "critical",
  quarantined_injection: "critical",
  superseded: "neutral",
};

function StatusBadge({
  status,
  statusDisplay,
}: {
  readonly status: KbDocumentStatus;
  readonly statusDisplay: string;
}) {
  return <Badge tone={STATUS_TONE[status]}>{statusDisplay}</Badge>;
}

function formatUploadedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export interface KbDocumentCardProps {
  readonly document: KbDocument;
}

export function KbDocumentCard({ document }: KbDocumentCardProps) {
  const pageCaption =
    document.page_count === null
      ? null
      : document.page_count === 1
        ? "1 page"
        : `${document.page_count} pages`;

  return (
    <Card className="flex flex-col gap-12 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-[0] flex-col gap-4">
        <p className="truncate text-card-title font-extrabold text-text-primary">
          {document.title}
        </p>
        <p className="truncate text-meta font-medium text-text-secondary">
          {document.filename} · v{document.version}
        </p>
        {/* agents.md §5.5: a number is always contextualised — a caption, never a bare figure. */}
        <p className="text-meta text-text-tertiary">
          Uploaded {formatUploadedDate(document.created_at)}
          {pageCaption !== null ? ` · ${pageCaption}` : ""}
        </p>
      </div>
      <div className="shrink-0">
        <StatusBadge status={document.status} statusDisplay={document.status_display} />
      </div>
    </Card>
  );
}

export default KbDocumentCard;
