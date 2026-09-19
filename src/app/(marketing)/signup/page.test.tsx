/**
 * Tests for `/signup` — step one of organisation self-signup.
 *
 * These drive the real page — `OrgSignupPage` -> `<OrgSignupForm>` — so the server shell and the
 * client form are exercised as they ship. Only `fetch` is replaced; there is no backend, and
 * nothing on this screen reads the router or the URL.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrgSignupPage, { metadata } from "./page";

const fetchMock = vi.fn();

/**
 * A response shaped the way `src/api/client.ts` consumes one — the same literal
 * `login/page.test.tsx` uses, and for the same reason: the client only touches `ok`, `status`,
 * `headers.get` and `json`.
 */
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lowercased = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lowercased.get(name.toLowerCase()) ?? null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** The §8.2 envelope, exactly as `kayla.errors.error_response` renders it. */
function envelope(code: string, message: string, details: Record<string, unknown> = {}) {
  return { error: { code, message, details } };
}

function fillForm(
  organization = "Sunrise Home Care",
  email = "dana@sunrisehomecare.com",
  fullName = "",
) {
  fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: organization } });
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  if (fullName !== "") {
    fireEvent.change(screen.getByLabelText("Your full name (optional)"), {
      target: { value: fullName },
    });
  }
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Create your organization" }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/signup", () => {
  it("is not indexable — a form is not a search destination", () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("posts organization name, work email and an omitted optional full name", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { status: "accepted" }));
    render(<OrgSignupPage />);

    fillForm();
    submit();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/orgs/signup/request");
    expect(init.method).toBe("POST");
    // `full_name` is optional in the contract. Omitted, not sent as "" — an empty string is a
    // value, not an absence, and the backend would store it as the owner's name.
    expect(JSON.parse(String(init.body))).toEqual({
      organization_name: "Sunrise Home Care",
      work_email: "dana@sunrisehomecare.com",
    });
  });

  it("sends the optional full name when one was typed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { status: "accepted" }));
    render(<OrgSignupPage />);

    fillForm("Sunrise Home Care", "dana@sunrisehomecare.com", "Dana Whitfield");
    submit();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).full_name).toBe("Dana Whitfield");
  });

  it("shows a check-your-email state naming the address, without claiming an account exists", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { status: "accepted" }));
    render(<OrgSignupPage />);

    fillForm();
    submit();

    const sent = await screen.findByRole("region", { name: "Check your email" });
    const text = sent.textContent ?? "";

    // The address is named back so a typo is visible.
    expect(text).toContain("dana@sunrisehomecare.com");

    // The 202 is byte-identical for a brand-new address, one that already has an account, and a
    // domain another organisation already uses — so the copy must be conditional. "If that
    // address can start an organization" is the honest form; anything that asserts a message was
    // definitely sent, or that an organisation was created, re-opens the oracle the constant 202
    // closes.
    expect(text).toContain("If dana@sunrisehomecare.com can start an organization");
    expect(text).toContain("Nothing has been created yet");
    expect(text).not.toMatch(/we (have )?(created|sent)/i);
    expect(text).not.toMatch(/your organization (has been|is) created/i);

    // The form is gone — there is nothing to submit twice.
    expect(screen.queryByRole("button", { name: "Create your organization" })).toBeNull();
  });

  it("renders a specific, kind explanation for business_email_required", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        422,
        envelope("business_email_required", "Use a business email address."),
      ),
    );
    render(<OrgSignupPage />);

    fillForm("Sunrise Home Care", "dana@gmail.com");
    submit();

    const alert = await screen.findByRole("alert");
    const text = alert.textContent ?? "";

    // The whole point: not a generic "check your details". It names the actual rule, and names a
    // free provider so the instruction is unambiguous.
    expect(text).toContain("work email address");
    expect(text).toContain("gmail.com");
    expect(text).not.toContain("Something went wrong");

    // The form stays put with what was typed, so the address can be corrected rather than
    // re-entered.
    expect((screen.getByLabelText("Organization name") as HTMLInputElement).value).toBe(
      "Sunrise Home Care",
    );
    expect(screen.queryByRole("region", { name: "Check your email" })).toBeNull();
  });

  it("falls back to generic copy for a code it does not recognise", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, envelope("internal_error", "boom")));
    render(<OrgSignupPage />);

    fillForm();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("Something went wrong");
  });

  it("explains a rate limit rather than blaming the input", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, envelope("rate_limited", "Slow down."), { "Retry-After": "30" }),
    );
    render(<OrgSignupPage />);

    fillForm();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("Too many attempts");
  });

  it("validates before the network, and never sends an incomplete body", async () => {
    render(<OrgSignupPage />);

    submit();

    expect(await screen.findByText("Enter your organization’s name.")).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Sunrise Home Care" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "not-an-address" } });
    submit();

    expect(await screen.findByText("That does not look like an email address.")).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("binds each label to its input with for/id rather than by wrapping", () => {
    render(<OrgSignupPage />);

    for (const label of ["Organization name", "Work email", "Your full name (optional)"]) {
      const input = screen.getByLabelText(label);
      expect(input.id).not.toBe("");
      const labelElement = document.querySelector(`label[for="${input.id}"]`);
      expect(labelElement?.textContent).toBe(label);
    }
  });

  it("renders no dashboard chrome — this route is outside the authenticated shell", () => {
    const { container } = render(<OrgSignupPage />);
    // `DashboardShell`'s rail is the tell. A session-gated shell around a signup form would
    // redirect the one visitor this page exists for.
    expect(container.querySelector("nav")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open navigation" })).toBeNull();
  });
});
