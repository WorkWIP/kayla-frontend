/**
 * Tests for `KpiTile`/`KpiStat` (agents.md §10.11 task 7).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KpiStat, KpiTile } from "./kpi-tile";
import { SuppressedNotice } from "./suppressed-notice";

afterEach(() => {
  cleanup();
});

describe("KpiTile", () => {
  it("renders a plain, non-interactive card when no href is given", () => {
    render(
      <KpiTile label="On track">
        <KpiStat value="85%" caption="24 signed-up workers with a start date" />
      </KpiTile>,
    );

    expect(screen.getByText("On track")).toBeDefined();
    expect(screen.getByText("85%")).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders as a real link, to the given href, when one is given", () => {
    render(
      <KpiTile label="New hires enrolled" href="/cohorts">
        <KpiStat value="26" caption="Every roster row for this org" />
      </KpiTile>,
    );

    const link = screen.getByRole("link", { name: /New hires enrolled/ });
    expect(link.getAttribute("href")).toBe("/cohorts");
    expect(screen.getByText("26")).toBeDefined();
  });

  it("renders arbitrary children — a suppressed notice, not only a KpiStat", () => {
    render(
      <KpiTile label="Check-in completion">
        <SuppressedNotice statusLabel="Not enough responses yet to report this" />
      </KpiTile>,
    );

    expect(screen.getByText("Not enough responses yet to report this")).toBeDefined();
  });
});

describe("KpiStat", () => {
  it("always contextualises its value with a caption when one is given", () => {
    render(<KpiStat value="92%" caption="24 of 26 signed up" />);

    expect(screen.getByText("92%")).toBeDefined();
    expect(screen.getByText("24 of 26 signed up")).toBeDefined();
  });

  it("renders with no caption when none is given, rather than an empty caption node", () => {
    const { container } = render(<KpiStat value="—" />);

    expect(screen.getByText("—")).toBeDefined();
    // Exactly one paragraph — the value — when there is no caption to pair with it.
    expect(container.querySelectorAll("p").length).toBe(1);
  });
});
