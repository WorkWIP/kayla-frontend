/**
 * Tests for `/auth/reset-password` — where the password-reset email lands: `POST
 * /auth/password-reset/confirm`. Mirrors `(marketing)/signup/verify/page.test.tsx`'s structure —
 * the same `AuthService._claim_link_token` backs both, and the three dead-link codes are byte-
 * identical — but this is a single request, not a verify-then-complete pair, and success never
 * signs anyone in (a reset revokes every session, so old tokens would be pointless to keep).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RESET_TOKEN = "reset-token-abc";

const nav = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.searchParams,
}));

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

function envelope(code: string, message: string, details: Record<string, unknown> = {}) {
  return { error: { code, message, details } };
}

import ResetPasswordPage, { metadata } from "./page";

function setPassword(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
}

beforeEach(() => {
  nav.searchParams = new URLSearchParams({ token: RESET_TOKEN });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/auth/reset-password", () => {
  it("is neither indexed nor followed — the URL carries a single-use token", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("renders a labelled new-password form when the link carries a token", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Type it again")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set new password" })).toBeTruthy();
  });

  it("shows the password policy before it is enforced", () => {
    render(<ResetPasswordPage />);

    const password = screen.getByLabelText("New password");
    const describedBy = password.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const hint = document.getElementById((describedBy ?? "").split(" ")[0] ?? "");
    expect(hint?.textContent ?? "").toContain("At least 12 characters");
  });

  it("checks the minimum length and the confirmation before the network", () => {
    render(<ResetPasswordPage />);

    setPassword("short");
    expect(screen.getByText("Use at least 12 characters.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    setPassword("a long enough password", "a different password");
    expect(screen.getByText("The two passwords do not match.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the token and new password, and never signs anyone in on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "ok" }));
    render(<ResetPasswordPage />);

    setPassword("correct horse battery staple");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/auth/password-reset/confirm");
    expect(JSON.parse(String(init.body))).toEqual({
      token: RESET_TOKEN,
      new_password: "correct horse battery staple",
    });

    expect(await screen.findByText("Password updated")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  describe("the three dead-link branches", () => {
    const cases = [
      { code: "verification_token_invalid", expected: "was not recognised" },
      { code: "verification_token_consumed", expected: "already been used" },
      { code: "verification_token_expired", expected: "has expired" },
    ] as const;

    for (const { code, expected } of cases) {
      it(`handles ${code} with its own sentence and a link to request a new one`, async () => {
        fetchMock.mockResolvedValue(jsonResponse(400, envelope(code, "no")));
        render(<ResetPasswordPage />);

        setPassword("correct horse battery staple");

        const panel = await screen.findByRole("region", { name: "This link cannot be used" });
        const text = panel.textContent ?? "";
        expect(text).toContain(expected);
        for (const other of cases.filter((candidate) => candidate.code !== code)) {
          expect(text).not.toContain(other.expected);
        }

        expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).toBe(
          "/forgot-password",
        );
        expect(screen.queryByLabelText("New password")).toBeNull();
      });
    }

    it("treats a missing ?token= as an unrecognised link, without calling the API", async () => {
      nav.searchParams = new URLSearchParams();

      render(<ResetPasswordPage />);

      const panel = await screen.findByRole("region", { name: "This link cannot be used" });
      expect(panel.textContent ?? "").toContain("was not recognised");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("lets the user retry after password_too_weak — the link stays usable", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          422,
          envelope("password_too_weak", "Too weak.", { problems: ["common_password", "too_short"] }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }));
    render(<ResetPasswordPage />);

    setPassword("password1234");

    const alert = await screen.findByRole("alert");
    const text = alert.textContent ?? "";
    expect(text).toContain("most commonly used passwords");
    expect(text).toContain("at least 12 characters");

    // Still on the form, not sent to the dead-link panel: the backend's own doc comment says a
    // weak password "leaves the link usable".
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "This link cannot be used" })).toBeNull();

    setPassword("a much better passphrase");
    await waitFor(() => expect(screen.getByText("Password updated")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("distinguishes a rate limit from a dead link", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, envelope("rate_limited", "slow down")));
    render(<ResetPasswordPage />);

    setPassword("correct horse battery staple");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many attempts from this device");
    expect(screen.queryByRole("region", { name: "This link cannot be used" })).toBeNull();
  });
});
