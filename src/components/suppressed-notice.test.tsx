/**
 * Tests for `SuppressedNotice` (agents.md §10.11 tasks 3/5).
 *
 * The load-bearing assertion in this file is the class-name scan: a suppressed metric must carry
 * NO colour class at all — not `bg-status-*`, not `text-status-*`, not `border-status-*`, and not
 * a raw hex/rgb value either — never a neutral grey standing in for a band. Every other test in
 * this task's suite (`traffic-light-meter.test.tsx`, `kpi-tile.test.tsx`, the two page tests)
 * delegates to this exact component for its own suppressed case, so getting this file right is
 * what makes every one of those "no colour when suppressed" assertions actually mean something.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SuppressedNotice } from "./suppressed-notice";

afterEach(() => {
  cleanup();
});

const STATUS_LABEL = "Not enough responses yet to report this";

describe("SuppressedNotice", () => {
  it("renders the server's own status label as real, readable text", () => {
    render(<SuppressedNotice statusLabel={STATUS_LABEL} />);

    expect(screen.getByText(STATUS_LABEL)).toBeDefined();
  });

  it("carries the lock glyph, hidden from assistive tech since the label text already says it", () => {
    const { container } = render(<SuppressedNotice statusLabel={STATUS_LABEL} />);

    const lock = screen.getByText("🔒");
    expect(lock.getAttribute("aria-hidden")).toBe("true");
    // The label text is a real, un-hidden sibling — a screen reader gets the full sentence.
    expect(container.textContent).toContain(STATUS_LABEL);
  });

  it("applies no band/status colour class at all — the core suppression requirement", () => {
    const { container } = render(<SuppressedNotice statusLabel={STATUS_LABEL} />);

    const html = container.innerHTML;
    // The three band families a real (non-suppressed) row is allowed to use, in any Tailwind
    // form (bg-/text-/border-, base or -subtle). None may appear anywhere in this component.
    expect(html).not.toMatch(/status-positive/);
    expect(html).not.toMatch(/status-attention/);
    expect(html).not.toMatch(/status-critical/);
    expect(html).not.toMatch(/\bgreen\b/i);
    expect(html).not.toMatch(/\bamber\b/i);
    expect(html).not.toMatch(/\bred\b/i);
    // No raw colour values either (agents.md R5 — and doubly so for a component whose entire
    // point is "no colour-coded styling").
    expect(html).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(html).not.toMatch(/rgb\(/i);
  });

  it("renders different status labels verbatim, never rewriting the server's copy", () => {
    render(<SuppressedNotice statusLabel="A custom, per-org suppression sentence." />);

    expect(screen.getByText("A custom, per-org suppression sentence.")).toBeDefined();
  });
});
