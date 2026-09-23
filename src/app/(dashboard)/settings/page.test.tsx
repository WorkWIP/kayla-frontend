/**
 * Tests for `/settings` (agents.md §10.11 task 10).
 *
 * `apiRequest` is exercised through a real `fetch` mock keyed off request URL (not mocked
 * itself), matching `cohorts/page.test.tsx` and `login/page.test.tsx`. The mock branches on the
 * path suffix because this page fires all four Settings reads together (`Promise.all`).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, setSession } from "@/api/client";
import type { components } from "@/api/generated";

import SettingsPage from "./page";

type OrgSettingsResponse = components["schemas"]["OrgSettingsResponse"];
type BrandingResponse = components["schemas"]["BrandingResponse"];

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function envelope(code: string, message: string, details: Record<string, unknown> = {}) {
  return { error: { code, message, details } };
}

const ORG_OWNER_SESSION = {
  tokens: {
    access_token: "access-token-value",
    token_type: "bearer" as const,
    expires_in: 900,
    expires_at: "2026-01-01T00:15:00Z",
    refresh_token: "refresh-token-value",
    refresh_expires_at: "2026-01-08T00:00:00Z",
  },
  user: {
    id: "9f1c2b3a-0000-4000-8000-000000000099",
    email: "owner@example.com",
    role: "org_owner" as const,
    email_verified: true,
    last_login_at: null,
  },
};

const HR_ADMIN_SESSION = {
  ...ORG_OWNER_SESSION,
  user: { ...ORG_OWNER_SESSION.user, email: "hr@example.com", role: "hr_admin" as const },
};

const SETTINGS: OrgSettingsResponse = {
  org_id: "9f1c2b3a-0000-4000-8000-000000000001",
  min_n_threshold: 4,
  signal_threshold_green: 75,
  signal_threshold_amber: 60,
  proactive_care_low_mood_count: 2,
  has_custom_settings: false,
  updated_at: null,
};

const BRANDING: BrandingResponse = {
  org_id: "9f1c2b3a-0000-4000-8000-000000000001",
  display_name: "Sunrise Home Care",
  logo_url: null,
  has_custom_branding: false,
  updated_at: null,
};

const ADMIN_USERS = [
  {
    id: "a1",
    email: "owner@example.com",
    role: "org_owner" as const,
    email_verified: true,
    last_login_at: "2026-09-10T12:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "a2",
    email: "hr@example.com",
    role: "hr_admin" as const,
    email_verified: false,
    last_login_at: null,
    created_at: "2026-02-01T00:00:00Z",
  },
];

const PRIVACY_DISCLOSURE = {
  version: 1,
  min_n_threshold: 4,
  text: "We only report a rate once at least 4 people have responded.",
};

const COST_OF_TURNOVER = {
  title: "Cost of turnover",
  description: "What replacing a worker in the first 90 days typically costs.",
  formula: "additional hires retained = new hires per year x turnover rate x reduction",
  example: {
    new_hires_per_year: 60,
    average_replacement_cost_usd: 3500,
    first_90_day_turnover_rate_percent: 35,
    estimated_reduction_percent: 20,
    additional_hires_retained: 4,
    estimated_annual_savings_usd: 14000,
  },
  disclaimer: "Illustrative figures, not a computation over this organisation's own data.",
};

const fetchMock = vi.fn();

function mockSettingsBackend(
  settings: OrgSettingsResponse = SETTINGS,
  branding: BrandingResponse = BRANDING,
) {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/dashboard/settings/admin-users")) {
      return Promise.resolve(jsonResponse(200, ADMIN_USERS));
    }
    if (url.endsWith("/dashboard/settings/privacy-disclosure")) {
      return Promise.resolve(jsonResponse(200, PRIVACY_DISCLOSURE));
    }
    if (url.endsWith("/dashboard/settings/cost-of-turnover")) {
      return Promise.resolve(jsonResponse(200, COST_OF_TURNOVER));
    }
    // More specific first: "/dashboard/settings/branding" also ends with "/dashboard/settings"'s
    // own suffix pattern would not match here since `endsWith` is exact, but keeping the specific
    // branding check ahead of the bare settings one documents the ordering this depends on.
    if (url.endsWith("/dashboard/settings/branding")) {
      return Promise.resolve(jsonResponse(200, branding));
    }
    if (url.endsWith("/dashboard/settings")) {
      return Promise.resolve(jsonResponse(200, settings));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Settings page — role gating", () => {
  it("shows an org-owners-only notice for an hr_admin session and fetches nothing", async () => {
    setSession(HR_ADMIN_SESSION);
    mockSettingsBackend();

    render(<SettingsPage />);

    expect(await screen.findByText("Org owners only.")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads all five sections for an org_owner session", async () => {
    setSession(ORG_OWNER_SESSION);
    mockSettingsBackend();

    render(<SettingsPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading");

    await waitFor(() => {
      expect(screen.getByText("Admin users")).toBeDefined();
    });

    expect(screen.getByText("Branding")).toBeDefined();
    expect(screen.getByDisplayValue(BRANDING.display_name)).toBeDefined();
    expect(screen.getByText("Using Kayla defaults")).toBeDefined();
    expect(screen.getByDisplayValue("4")).toBeDefined(); // min_n_threshold
    expect(screen.getByText("owner@example.com")).toBeDefined();
    expect(screen.getByText("hr@example.com")).toBeDefined();
    expect(screen.getByText(PRIVACY_DISCLOSURE.text)).toBeDefined();
    expect(screen.getByText("Cost of turnover")).toBeDefined();
    expect(screen.getByText("$14,000")).toBeDefined();

    // No interactive calculator — no reduction/turnover-rate inputs outside the Thresholds form.
    const numberInputs = document.querySelectorAll('input[type="number"]');
    expect(numberInputs.length).toBe(4);
  });
});

describe("Settings page — thresholds form", () => {
  it("disables Save until a field actually changes, then PATCHes only the changed field", async () => {
    setSession(ORG_OWNER_SESSION);
    mockSettingsBackend();

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue("4")).toBeDefined());

    const saveButton = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const minNInput = screen.getByLabelText(/Minimum respondents/);
    fetchMock.mockImplementationOnce((url: string) => {
      expect(url).toBe("http://localhost:8000/dashboard/settings");
      return Promise.resolve(
        jsonResponse(200, { ...SETTINGS, min_n_threshold: 5, has_custom_settings: true, updated_at: "2026-09-18T00:00:00Z" }),
      );
    });

    fireEvent.change(minNInput, { target: { value: "5" } });

    await waitFor(() => expect(saveButton.disabled).toBe(false));

    fireEvent.click(saveButton);

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/dashboard/settings");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ min_n_threshold: 5 });

    await waitFor(() => {
      expect(screen.getByText("Custom settings")).toBeDefined();
    });
  });

  it("blocks submit and shows an inline message when amber is not lower than green", async () => {
    setSession(ORG_OWNER_SESSION);
    mockSettingsBackend();

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue("4")).toBeDefined());

    const amberInput = screen.getByLabelText(/Amber cutoff/);
    fireEvent.change(amberInput, { target: { value: "80" } }); // >= green (75)

    await waitFor(() => {
      expect(screen.getByText("The amber cutoff must be lower than the green cutoff.")).toBeDefined();
    });
    const saveButton = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("surfaces a merged cross-field 422 from the server on save", async () => {
    setSession(ORG_OWNER_SESSION);
    mockSettingsBackend();

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue("4")).toBeDefined());

    const minNInput = screen.getByLabelText(/Minimum respondents/);
    fireEvent.change(minNInput, { target: { value: "10" } });

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(
          422,
          envelope("invalid_org_settings", "signal_threshold_amber must be lower than signal_threshold_green"),
        ),
      ),
    );

    const saveButton = await screen.findByRole("button", { name: "Save changes" });
    fireEvent.click(saveButton);

    const alert = await screen.findByText("Could not save Settings.");
    expect(alert).toBeDefined();
    expect(
      screen.getByText("signal_threshold_amber must be lower than signal_threshold_green"),
    ).toBeDefined();
  });
});

describe("Settings page — load failure", () => {
  it("surfaces a failed initial load as an alert", async () => {
    setSession(ORG_OWNER_SESSION);
    fetchMock.mockResolvedValue(jsonResponse(403, envelope("forbidden", "not an org owner")));

    render(<SettingsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load Settings.");
  });
});
