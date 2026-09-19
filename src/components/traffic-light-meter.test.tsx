/**
 * Tests for `TrafficLightMeter` (agents.md §10.11 tasks 3-5).
 *
 * Covers all three real bands (colour + label together, never colour alone) and the suppressed
 * case — asserting it renders via `SuppressedNotice` with no band colour class, the single most
 * important behaviour this component has (see `suppressed-notice.test.tsx` for the exhaustive
 * colour-class scan this file's suppressed assertions build on).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TrafficLightMeter } from "./traffic-light-meter";
import type { SignalBand } from "./traffic-light-meter";

afterEach(() => {
  cleanup();
});

const BAND_CLASS: Record<SignalBand, string> = {
  green: "bg-status-positive",
  amber: "bg-status-attention",
  red: "bg-status-critical",
};

describe("TrafficLightMeter", () => {
  it.each<[SignalBand, string]>([
    ["green", "On track"],
    ["amber", "Watch"],
    ["red", "Needs attention"],
  ])("renders a %s dot alongside its status label, never colour alone", (band, statusLabel) => {
    const { container } = render(
      <TrafficLightMeter label="Role clarity" band={band} suppressed={false} statusLabel={statusLabel} />,
    );

    expect(screen.getByText("Role clarity")).toBeDefined();
    expect(screen.getByText(statusLabel)).toBeDefined();
    expect(container.innerHTML).toContain(BAND_CLASS[band]);
    // Only its own band colour appears — never a different band's dot alongside it.
    (Object.values(BAND_CLASS) as string[])
      .filter((cls) => cls !== BAND_CLASS[band])
      .forEach((otherClass) => {
        expect(container.innerHTML).not.toContain(otherClass);
      });
  });

  it("renders no colour class at all when suppressed, plus the lock and the label", () => {
    const statusLabel = "Not enough responses yet to report this";
    const { container } = render(
      <TrafficLightMeter label="Manager support" band={null} suppressed statusLabel={statusLabel} />,
    );

    expect(screen.getByText("Manager support")).toBeDefined();
    expect(screen.getByText(statusLabel)).toBeDefined();
    expect(screen.getByText("🔒")).toBeDefined();

    const html = container.innerHTML;
    expect(html).not.toMatch(/status-positive/);
    expect(html).not.toMatch(/status-attention/);
    expect(html).not.toMatch(/status-critical/);
  });

  it("treats a null band as suppressed even if `suppressed` were ever passed false by mistake", () => {
    const statusLabel = "Not enough responses yet to report this";
    const { container } = render(
      <TrafficLightMeter label="Energy" band={null} suppressed={false} statusLabel={statusLabel} />,
    );

    expect(screen.getByText("🔒")).toBeDefined();
    const html = container.innerHTML;
    expect(html).not.toMatch(/status-positive/);
    expect(html).not.toMatch(/status-attention/);
    expect(html).not.toMatch(/status-critical/);
  });
});
