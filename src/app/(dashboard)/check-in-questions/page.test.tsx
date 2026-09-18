/**
 * Tests for `/check-in-questions` (agents.md §10.9 task 7).
 *
 * `apiRequest` is exercised through a real `fetch` mock (not mocked itself), the same approach
 * `/cohorts/page.test.tsx` and `src/app/login/page.test.tsx` use, so the request URL, method and
 * the contract's response shape are all real rather than assumed.
 *
 * Deliberately uses construct ids the real registry does not have (`"zeta_construct"`,
 * `"alpha_thing"`) in one test, precisely to prove this screen renders whatever the API sends
 * rather than a hardcoded list — see `checkin-question-card.tsx`'s own docstring for why that
 * matters to this phase's fitness test.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import CheckInQuestionsPage from "./page";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function envelope(code: string, message: string) {
  return { error: { code, message, details: {} } };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("check-in questions", () => {
  it("announces a loading state, then renders every question ordered by display_order", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: "qs-1",
        version: 1,
        questions: [
          {
            id: "q-2",
            construct_id: "zeta_construct",
            question_type: "scale",
            milestone_days: [30, 60],
            display_order: 1,
          },
          {
            id: "q-1",
            construct_id: "alpha_thing",
            question_type: "free_text",
            milestone_days: [7, 30, 60, 90],
            display_order: 0,
          },
        ],
      }),
    );

    render(<CheckInQuestionsPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading");

    await waitFor(() => {
      expect(screen.getByText("Alpha thing")).toBeDefined();
    });

    // Never a hardcoded construct list: ids the seeded five never contain still render, humanized
    // generically (underscores -> spaces, first letter capitalized).
    expect(screen.getByText("Zeta construct")).toBeDefined();
    expect(screen.getByText("alpha_thing")).toBeDefined();
    expect(screen.getByText("zeta_construct")).toBeDefined();

    // Ordered by display_order (0 then 1), not by array position in the response.
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Alpha thing");
    expect(items[1]?.textContent).toContain("Zeta construct");

    expect(screen.getByText("Day 7")).toBeDefined();
    expect(screen.getByText("Day 90")).toBeDefined();
    expect(screen.getByText("Free text")).toBeDefined();
    expect(screen.getByText(/Scale response/)).toBeDefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/checkins/question-sets/active");
    expect(init.method).toBe("GET");
  });

  it("shows an empty state, not an alert, when the org has no active question set", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, envelope("checkin_question_set_not_found", "no active set")),
    );

    render(<CheckInQuestionsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No active check-in question set/)).toBeDefined();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("surfaces a role-forbidden response as a clear access message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, envelope("forbidden", "not an hr admin")));

    render(<CheckInQuestionsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("HR admins and org owners");
  });

  it("surfaces a failed load as an alert rather than an empty screen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("unauthorized", "not signed in")));
    render(<CheckInQuestionsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load the check-in question set.");
  });
});
