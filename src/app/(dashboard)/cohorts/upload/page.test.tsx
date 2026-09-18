/**
 * Smoke test for `/cohorts/upload` (agents.md §10.3 tasks 3–5). The interactive behaviour is
 * `RosterUploadFlow`'s own test suite (`src/components/roster-upload-flow.test.tsx`); this file
 * only confirms the page renders it with the expected chrome.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import UploadRosterPage from "./page";

beforeEach(() => {
  clearSession();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("no request expected before a file is chosen")),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("upload roster page", () => {
  it("renders one heading, a back link, and the real file picker", () => {
    render(<UploadRosterPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Upload roster");

    expect(screen.getByRole("link", { name: /Back to cohorts/ }).getAttribute("href")).toBe(
      "/cohorts",
    );

    const input = screen.getByLabelText("Roster CSV");
    expect(input.getAttribute("type")).toBe("file");
    expect(input.getAttribute("accept")).toBe(".csv");
  });
});
