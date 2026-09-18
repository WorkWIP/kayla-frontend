/**
 * Tests for the 3-step real CSV upload flow (agents.md §10.3 tasks 3–5).
 *
 * `fetch` is mocked (there is no backend in a unit test); everything else is real, including the
 * step transitions, so a broken "continue past an invalid row" or a confirm that fires without a
 * click would fail one of these rather than only showing up by hand later.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import { RosterUploadFlow } from "./roster-upload-flow";

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

function csvFile(name = "roster.csv") {
  return new File(["Last Name,First Name,email\nRivera,Alex,alex@example.com\n"], name, {
    type: "text/csv",
  });
}

const CLEAN_PREVIEW = {
  preview_token: "token-clean",
  expires_in_seconds: 1800,
  column_mapping: {
    last_name: "Last Name",
    first_name: "First Name",
    email: "email",
    start_date: null,
    site: null,
    role_title: null,
  },
  summary: { total_rows: 1, new_count: 1, updated_count: 0, unchanged_count: 0, invalid_count: 0 },
  rows: [
    {
      row_number: 2,
      first_name: "Alex",
      last_name: "Rivera",
      email: "alex@example.com",
      diagnosis: "new" as const,
      changes: [],
      problems: [],
      start_date: null,
      site: null,
      role_title: null,
    },
  ],
};

const PREVIEW_WITH_PROBLEM = {
  ...CLEAN_PREVIEW,
  preview_token: "token-invalid",
  summary: { total_rows: 1, new_count: 0, updated_count: 0, unchanged_count: 0, invalid_count: 1 },
  rows: [
    {
      row_number: 2,
      first_name: "",
      last_name: "Rivera",
      email: "",
      diagnosis: "invalid" as const,
      changes: [],
      problems: ["missing_email"],
      start_date: null,
      site: null,
      role_title: null,
    },
  ],
};

const CONFIRM_RESULT = { new_count: 1, updated_count: 0, unchanged_count: 0, total_rows: 1 };

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

async function selectFile(file: File) {
  const input = screen.getByLabelText("Roster CSV");
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => {
    expect(screen.getByText("Column mapping")).toBeDefined();
  });
}

describe("roster upload — step 1: file", () => {
  it("names the file field and only accepts .csv", () => {
    render(<RosterUploadFlow />);

    const input = screen.getByLabelText("Roster CSV");
    expect(input.getAttribute("type")).toBe("file");
    expect(input.getAttribute("accept")).toBe(".csv");
  });

  it("previews the real file contents against POST /rosters/preview", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, CLEAN_PREVIEW));
    render(<RosterUploadFlow />);

    await selectFile(csvFile());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/rosters/preview");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    // No Content-Type is set by hand — the browser supplies the multipart boundary itself.
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("shows a failed parse as an alert without leaving the file step", async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, envelope("invalid_csv", "No email column found.")));
    render(<RosterUploadFlow />);

    fireEvent.change(screen.getByLabelText("Roster CSV"), { target: { files: [csvFile()] } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No email column found.");
    expect(screen.getByLabelText("Roster CSV")).toBeDefined();
  });
});

describe("roster upload — step 2: mapping and per-row diagnosis", () => {
  it("shows the real column mapping and lets a clean file continue", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, CLEAN_PREVIEW));
    render(<RosterUploadFlow />);
    await selectFile(csvFile());

    expect(screen.getByText("Last Name")).toBeDefined();
    expect(screen.getByText("email")).toBeDefined();
    expect(screen.getByText("New")).toBeDefined();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect((continueButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks continuing past a row the API flagged invalid, and describes why", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, PREVIEW_WITH_PROBLEM));
    render(<RosterUploadFlow />);
    await selectFile(csvFile());

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("must be fixed");

    const row = screen.getAllByRole("row").find((candidate) => candidate.hasAttribute("aria-invalid"));
    expect(row?.getAttribute("aria-invalid")).toBe("true");
    const describedBy = row?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toContain("Missing email address");

    // Clicking Continue while disabled must not advance the flow or call confirm.
    fireEvent.click(continueButton);
    expect(screen.queryByText("Confirm this upload")).toBeNull();
  });
});

describe("roster upload — step 3: confirm is a real pause", () => {
  it("does not call POST /rosters/confirm until the confirm button is clicked", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, CLEAN_PREVIEW));
    render(<RosterUploadFlow />);
    await selectFile(csvFile());

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const heading = await screen.findByText("Confirm this upload");
    expect(within(heading.closest("div") as HTMLElement).getByText(/1 new roster entry/)).toBeDefined();

    // Reaching this screen must not itself have committed anything.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, CONFIRM_RESULT));
    fireEvent.click(screen.getByRole("button", { name: "Confirm upload" }));

    await waitFor(() => {
      expect(screen.getByText("Roster updated")).toBeDefined();
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/rosters/confirm");
    expect(JSON.parse(String(init.body))).toEqual({ preview_token: "token-clean" });

    expect(screen.getByRole("link", { name: "View cohorts" }).getAttribute("href")).toBe(
      "/cohorts",
    );
  });

  it("lets a stale confirm be retried rather than losing the parsed preview", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, CLEAN_PREVIEW));
    render(<RosterUploadFlow />);
    await selectFile(csvFile());
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Confirm this upload");

    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, envelope("preview_expired", "expired")),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm upload" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("expired or was already confirmed");
    // The confirm button is still present — the flow does not strand the user.
    expect(screen.getByRole("button", { name: "Confirm upload" })).toBeDefined();
  });
});
