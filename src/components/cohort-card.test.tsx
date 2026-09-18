/**
 * Smoke tests for `CohortCard` (agents.md §10.3 task 7).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CohortCard } from "./cohort-card";

afterEach(() => {
  cleanup();
});

describe("CohortCard", () => {
  it("renders the label and links to the cohort's detail page", () => {
    render(<CohortCard id="9f1c2b3a-1111-4a2b-9c3d-000000000001" label="September 2026" rosterEntryCount={12} />);

    const link = screen.getByRole("link", { name: /September 2026/ });
    expect(link.getAttribute("href")).toBe("/cohorts/9f1c2b3a-1111-4a2b-9c3d-000000000001");
    expect(screen.getByText("12 roster entries")).toBeDefined();
  });

  it("gives a single-entry cohort singular copy rather than '1 roster entries'", () => {
    render(<CohortCard id="9f1c2b3a-1111-4a2b-9c3d-000000000002" label="No start date" rosterEntryCount={1} />);

    expect(screen.getByText("1 roster entry")).toBeDefined();
    expect(screen.queryByText("1 roster entries")).toBeNull();
  });
});
