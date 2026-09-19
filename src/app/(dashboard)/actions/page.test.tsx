/**
 * `/actions` — the approve / dismiss review flow.
 *
 * This page had no test of its own before; the only thing rendering it was the
 * `no-individual-care-usage` crawl, which proves what it must never show, not what it does.
 * What is covered here is the part that writes: dismissing is terminal in the nudge state
 * machine (`draft -> pending -> approved -> sent`, with `dismissed` reachable only from
 * `pending`, and nothing reachable from `dismissed`), so it goes through a confirmation dialog
 * and — the assertion that actually matters — sends nothing until that dialog is confirmed.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import ActionsPage from "./page";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const NUDGE = {
  id: "9a1f0000-0000-4000-8000-000000000001",
  site_id: "5b1e2c3a-0000-4000-8000-0000000000a1",
  site_name: "Building A",
  construct_id: "workload",
  triggering_signal_summary: "workload band=red, n=12",
  status: "pending",
  drafted_title: "Workload is trending down at Building A",
  drafted_body: "Consider reviewing shift coverage for the next two weeks.",
  approved_by_user_id: null,
  approved_at: null,
  sent_at: null,
  dismissed_at: null,
  created_at: "2026-09-18T12:00:00Z",
};

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

async function renderWithOnePendingNudge() {
  fetchMock.mockResolvedValue(jsonResponse(200, [NUDGE]));
  render(<ActionsPage />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined();
  });
}

describe("Actions — dismissing a nudge", () => {
  it("shows an empty state, not a blank page, when nothing is waiting", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    render(<ActionsPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading");

    await waitFor(() => {
      expect(screen.getByText("Nothing to review")).toBeDefined();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks before dismissing, and sends nothing while the question is open", async () => {
    await renderWithOnePendingNudge();
    expect(fetchMock).toHaveBeenCalledTimes(1); // the initial GET, and nothing else

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    const dialog = screen.getByRole("dialog", { name: "Dismiss this nudge?" });
    expect(within(dialog).getByText(/Workload is trending down at Building A/)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backs out cleanly, leaving the nudge exactly where it was", async () => {
    await renderWithOnePendingNudge();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined();
  });

  it("POSTs the dismissal only once the dialog is confirmed, then closes it", async () => {
    await renderWithOnePendingNudge();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...NUDGE, status: "dismissed", dismissed_at: "2026-09-18T13:00:00Z" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss nudge" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe(`http://localhost:8000/dashboard/actions/${NUDGE.id}/dismiss`);
    expect(init.method).toBe("POST");

    // The card moved sections rather than vanishing — a dismissed nudge is still a record.
    await waitFor(() => {
      expect(screen.getByTestId(`nudge-card-${NUDGE.id}`).getAttribute("data-status")).toBe(
        "dismissed",
      );
    });
  });
});
