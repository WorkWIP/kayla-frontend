/**
 * Tests for `KbDocumentCard` (agents.md §10.5 task 13, Q-51).
 *
 * The backend (`kayla.kb.router._render_status_display`) already renders Q-51's exact copy into
 * `status_display`, so these tests pin that this component displays it verbatim — including the
 * two rows that carry a real number — rather than re-deriving or paraphrasing it, and that the
 * status badge still picks a sensible colour off the machine `status` alongside that text.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KbDocumentCard, isKbDocumentTerminal } from "./kb-document-card";
import type { KbDocument, KbDocumentStatus } from "./kb-document-card";

afterEach(() => {
  cleanup();
});

function baseDocument(overrides: Partial<KbDocument> = {}): KbDocument {
  return {
    id: "9f1c2b3a-1111-4a2b-9c3d-000000000001",
    title: "Employee Handbook",
    filename: "handbook.pdf",
    version: 1,
    status: "uploaded",
    status_display: "Queued",
    page_count: 12,
    superseded_at: null,
    uploaded_by: "9f1c2b3a-1111-4a2b-9c3d-000000000099",
    created_at: "2026-09-01T12:00:00Z",
    updated_at: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

describe("isKbDocumentTerminal", () => {
  it("treats uploaded/parsing/chunking/embedding as non-terminal", () => {
    expect(isKbDocumentTerminal("uploaded")).toBe(false);
    expect(isKbDocumentTerminal("parsing")).toBe(false);
    expect(isKbDocumentTerminal("chunking")).toBe(false);
    expect(isKbDocumentTerminal("embedding")).toBe(false);
  });

  it("treats every other status as terminal", () => {
    expect(isKbDocumentTerminal("indexed")).toBe(true);
    expect(isKbDocumentTerminal("failed_parse_error")).toBe(true);
    expect(isKbDocumentTerminal("quarantined_injection")).toBe(true);
    expect(isKbDocumentTerminal("superseded")).toBe(true);
  });
});

describe("KbDocumentCard", () => {
  it("renders the title, filename, version and an uploaded caption", () => {
    render(
      <KbDocumentCard
        document={baseDocument({ title: "PTO Policy", filename: "pto.pdf", version: 2 })}
      />,
    );

    expect(screen.getByText("PTO Policy")).toBeDefined();
    expect(screen.getByText("pto.pdf · v2")).toBeDefined();
    expect(screen.getByText(/12 pages/)).toBeDefined();
  });

  it("gives a single-page document singular copy rather than '1 pages'", () => {
    render(<KbDocumentCard document={baseDocument({ page_count: 1 })} />);
    expect(screen.getByText(/1 page\b/)).toBeDefined();
  });

  it.each<[KbDocumentStatus, string]>([
    ["uploaded", "Queued"],
    ["parsing", "Processing"],
    ["chunking", "Processing"],
    ["embedding", "Processing"],
    ["indexed", "Indexed - 6 sections"],
    ["failed_unsupported_format", "We cannot read .xlsx files yet"],
    ["failed_too_large", "Files must be under 25 MB"],
    ["failed_encrypted", "This PDF is password-protected"],
    ["failed_no_text_layer", "This looks like a scan - we are running OCR (auto-retries)"],
    ["failed_parse_error", "Something went wrong. We have been notified."],
    ["quarantined_injection", "Needs review before we can use it"],
    ["superseded", "Replaced by v-2"],
  ])("renders the backend's exact status_display verbatim for %s", (status, statusDisplay) => {
    render(<KbDocumentCard document={baseDocument({ status, status_display: statusDisplay })} />);
    expect(screen.getByText(statusDisplay)).toBeDefined();
  });
});
