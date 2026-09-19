/**
 * Tests for `/forgot-password` — requesting a password-reset link.
 *
 * `POST /auth/password-reset/request` is answered `202` with an identical body whether or not the
 * address has an account (`RAG.md` §12.3, `PasswordResetRequest`'s own doc comment). The branch
 * matrix this file exists to pin:
 *
 *   any address, known or not     the same "check your email" state, never distinguishable
 *   validation                    before any network call
 *   rate limit / offline          told apart from the success state, form still usable after
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lowercased = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lowercased.get(name.toLowerCase()) ?? null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function envelope(code: string, message: string) {
  return { error: { code, message, details: {} } };
}

import ForgotPasswordPage, { metadata } from "./page";

function submit(email = "hr@example.com") {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/forgot-password", () => {
  it("is neither indexed nor followed — this is a step in account recovery, not a landing page", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("renders one heading and a labelled email field", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByLabelText("Work email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeTruthy();
  });

  describe("validation before any round trip", () => {
    it("refuses an empty email without calling the API", async () => {
      render(<ForgotPasswordPage />);
      fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

      expect(await screen.findByText("Enter your work email address.")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("catches an obvious typo without calling the API", async () => {
      render(<ForgotPasswordPage />);
      fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "hr.example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

      expect(await screen.findByText("That does not look like an email address.")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("sends the trimmed email and no org_id — this form has none to send", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { status: "accepted" }));
    render(<ForgotPasswordPage />);

    submit("  HR@example.com  ");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/auth/password-reset/request");
    expect(JSON.parse(String(init.body))).toEqual({ email: "HR@example.com" });
  });

  describe("the success state is unconditional", () => {
    it("shows the same 'check your email' state for a real address", async () => {
      fetchMock.mockResolvedValue(jsonResponse(202, { status: "accepted" }));
      render(<ForgotPasswordPage />);

      submit("hr@example.com");

      expect(await screen.findByText("Check your email")).toBeTruthy();
      // Never echoes the address back and never claims a message WAS sent — either would let a
      // caller infer whether that specific address has an account.
      expect(screen.queryByText(/hr@example\.com/)).toBeNull();
      expect(screen.queryByText(/we (have |'ve )?sent/i)).toBeNull();
    });

    it("offers a way back to try a different address", async () => {
      fetchMock.mockResolvedValue(jsonResponse(202, { status: "accepted" }));
      render(<ForgotPasswordPage />);

      submit();
      await screen.findByText("Check your email");

      fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));

      expect(await screen.findByLabelText("Work email")).toBeTruthy();
      expect(screen.queryByText("Check your email")).toBeNull();
    });

    it("links back to sign-in from the sent state", async () => {
      fetchMock.mockResolvedValue(jsonResponse(202, { status: "accepted" }));
      render(<ForgotPasswordPage />);

      submit();
      await screen.findByText("Check your email");

      expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/login");
    });
  });

  describe("failures, told apart from success", () => {
    it("distinguishes a rate limit from the sent state", async () => {
      fetchMock.mockResolvedValue(jsonResponse(429, envelope("rate_limited", "slow down")));
      render(<ForgotPasswordPage />);

      submit();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Too many attempts from this device");
      expect(screen.queryByText("Check your email")).toBeNull();
    });

    it("survives a transport failure instead of surfacing a raw fetch error", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      render(<ForgotPasswordPage />);

      submit();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Kayla is not reachable right now");
    });

    it("leaves the form usable after a failure rather than stranding a spinner", async () => {
      fetchMock.mockResolvedValue(jsonResponse(429, envelope("rate_limited", "slow down")));
      render(<ForgotPasswordPage />);

      submit();
      await screen.findByRole("alert");

      fetchMock.mockResolvedValue(jsonResponse(202, { status: "accepted" }));
      fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });
  });

  it("links to sign-in from the request form too", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/login");
  });
});
