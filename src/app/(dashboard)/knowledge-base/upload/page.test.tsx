/**
 * Smoke test for `/knowledge-base/upload` (agents.md §10.5 tasks 1–2). The interactive behaviour
 * is `KbUploadFlow`'s own test suite (`src/components/kb-upload-flow.test.tsx`); this file only
 * confirms the page renders it with the expected chrome.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import UploadKbDocumentPage from "./page";

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

describe("upload knowledge base document page", () => {
  it("renders one heading, a back link, and the real form fields", () => {
    render(<UploadKbDocumentPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Upload document");

    expect(
      screen.getByRole("link", { name: /Back to Knowledge Base/ }).getAttribute("href"),
    ).toBe("/knowledge-base");

    const fileInput = screen.getByLabelText("Document file");
    expect(fileInput.getAttribute("type")).toBe("file");
    expect(fileInput.getAttribute("accept")).toBe(".pdf,.docx,.txt,.md");
  });
});
