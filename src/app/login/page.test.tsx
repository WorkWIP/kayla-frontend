/**
 * Tests for `/login` (agents.md §10.1 task 7).
 *
 * These drive the real page — `LoginPage` -> `<Suspense>` -> `<LoginForm>` — so the Suspense
 * boundary, the metadata-bearing shell and the client form are all exercised as they ship. Only
 * the two things a unit test cannot own are replaced: `next/navigation` (there is no router
 * outside the app) and `fetch` (there is no backend).
 *
 * Every assertion below is written to fail when the behaviour it names breaks, not merely when the
 * component fails to render (agents.md §11.3: "test quality — do they fail when the code breaks?").
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, getSession } from "@/api/client";

import LoginPage from "./page";

const ORG_ID = "6f2b1c34-8a5e-4f7b-9c21-0d9e3a5b7c81";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  // Read through the object so a test can swap the query string before rendering.
  useSearchParams: () => nav.searchParams,
}));

const fetchMock = vi.fn();

/**
 * A response shaped the way `src/api/client.ts` consumes one. Deliberately not a real `Response`:
 * the client only ever touches `ok`, `status`, `headers.get` and `json`, and a literal keeps the
 * test from depending on which `fetch` polyfill the environment happens to provide.
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

function session(role: string) {
  return {
    tokens: {
      access_token: "access-token-value",
      token_type: "bearer",
      expires_in: 900,
      expires_at: "2026-01-01T00:15:00Z",
      refresh_token: "refresh-token-value",
      refresh_expires_at: "2026-01-08T00:00:00Z",
    },
    user: {
      id: "0f3f0d38-6d1a-4a2f-93bd-4b6f4e1a2c77",
      email: "hr@example.com",
      role,
      email_verified: true,
      last_login_at: null,
    },
  };
}

/** The §8.2 envelope, exactly as `kayla.errors.error_response` renders it. */
function envelope(code: string, message: string) {
  return { error: { code, message, details: {} } };
}

function signIn(email = "hr@example.com", password = "correct horse battery staple") {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.searchParams = new URLSearchParams(`org=${ORG_ID}`);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("login screen — structure and accessible names", () => {
  it("gives the screen one level-1 heading and names every control", () => {
    render(<LoginPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Sign in");

    // getByLabelText resolves the accessible name through the accessibility tree, so these pass
    // only while a real <label for> (or an aria-label) is attached to a real form control.
    expect(screen.getByLabelText("Work email").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Password").tagName).toBe("INPUT");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
  });

  it("binds each label to its input with for/id rather than by wrapping", () => {
    const { container } = render(<LoginPage />);

    for (const label of Array.from(container.querySelectorAll("label"))) {
      const target = label.getAttribute("for");
      expect(target).toBeTruthy();
      // getElementById rather than a `#id` selector: React's useId emits ids containing
      // characters a CSS selector would have to escape, and jsdom ships no CSS.escape.
      expect(document.getElementById(target ?? "")?.tagName).toBe("INPUT");
    }
  });

  it("asks for the password with a masked field and the right autocomplete hints", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByLabelText("Work email").getAttribute("autocomplete")).toBe("username");
  });

  it("keeps every interactive target at the 44x44 minimum of agents.md §5.6", () => {
    render(<LoginPage />);

    // jsdom has no layout engine, so the size cannot be measured; what can be asserted is that the
    // sizing class is still on each control. `min-h-48` is the design system's first spacing step
    // at or above 44 (the scale goes 40 -> 48), so this is the token that satisfies the rule.
    const controls = [
      screen.getByLabelText("Work email"),
      screen.getByLabelText("Password"),
      screen.getByRole("button", { name: "Sign in" }),
    ];
    for (const control of controls) {
      expect(control.className.split(/\s+/)).toContain("min-h-48");
    }
  });
});

describe("login screen — the organisation is resolved server-side", () => {
  it("renders a plain sign-in form with no invitation link at all", () => {
    nav.searchParams = new URLSearchParams();

    render(<LoginPage />);

    expect(screen.getByLabelText("Work email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("sends no org_id when the visit carries no invitation link", async () => {
    nav.searchParams = new URLSearchParams();
    fetchMock.mockResolvedValue(jsonResponse(200, session("hr_admin")));
    render(<LoginPage />);

    signIn();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("org_id");
    expect(body).toEqual({ email: "hr@example.com", password: "correct horse battery staple" });
  });

  it("ignores a query parameter that is not a uuid, and still renders a working form", () => {
    nav.searchParams = new URLSearchParams("org=not-a-uuid");

    render(<LoginPage />);

    expect(screen.getByLabelText("Work email")).toBeTruthy();
  });

  it("does not carry an organisation from one visit into the next — found live: a stale value from a first organisation broke sign-in to a second one from the same browser", async () => {
    // A first visit resolves an id from the link and signs in successfully.
    fetchMock.mockResolvedValue(jsonResponse(200, session("hr_admin")));
    render(<LoginPage />);
    signIn();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    cleanup();

    // A later, ordinary visit with no link of its own must not resend the first visit's id.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(200, session("hr_admin")));
    nav.searchParams = new URLSearchParams();
    render(<LoginPage />);
    signIn();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("org_id");
  });
});

describe("login screen — recovering a forgotten password", () => {
  it("links to /forgot-password", () => {
    render(<LoginPage />);

    expect(screen.getByRole("link", { name: "Forgot your password?" }).getAttribute("href")).toBe(
      "/forgot-password",
    );
  });
});

describe("login screen — validation happens before the network does", () => {
  it("refuses an empty email, marks the field invalid and describes why", async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const field = screen.getByLabelText("Work email");
    await waitFor(() => {
      expect(field.getAttribute("aria-invalid")).toBe("true");
    });

    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Enter your work email address.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an address with no @ and moves focus to the field that is wrong", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "hr.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const field = screen.getByLabelText("Work email");
    await waitFor(() => {
      expect(field.getAttribute("aria-invalid")).toBe("true");
    });
    expect(document.activeElement).toBe(field);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an empty password without applying the password policy to a sign-in", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "hr@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const field = screen.getByLabelText("Password");
    await waitFor(() => {
      expect(field.getAttribute("aria-invalid")).toBe("true");
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // A short password is a *server* decision at sign-in: enforcing the 12-character policy here
    // would lock out an older password and tell an attacker what the rule is.
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("invalid_credentials", "no")));
    fireEvent.change(field, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("marks a field valid again once it has been corrected and resubmitted", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("invalid_credentials", "no")));
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Work email").getAttribute("aria-invalid")).toBe("true");
    });

    signIn();

    await waitFor(() => {
      expect(screen.getByLabelText("Work email").getAttribute("aria-invalid")).toBe("false");
    });
    expect(screen.getByLabelText("Work email").getAttribute("aria-describedby")).toBeNull();
  });
});

describe("login screen — submitting", () => {
  it("posts the contract's login body and redirects a dashboard user", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, session("hr_admin")));
    render(<LoginPage />);

    signIn("  HR@example.com  ", "correct horse battery staple");

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/overview");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/auth/login");
    expect(init.method).toBe("POST");
    // The one request in this app that accepts a cookie rather than ignoring one. `credentials:
    // "omit"` — the default for every other call, and what removes the ambient authority CSRF
    // depends on — makes the browser discard `Set-Cookie` outright, so without this the backend's
    // `HttpOnly` refresh cookie would be sent and silently dropped, and every page reload would
    // sign the user out again. The token still travels on the `Authorization` header; the cookie
    // is unreadable from here and is only ever presented to `POST /auth/session`.
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({
      org_id: ORG_ID,
      email: "HR@example.com",
      password: "correct horse battery staple",
    });
  });

  it("holds the access token in memory and puts no credential in web storage", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, session("org_owner")));
    render(<LoginPage />);

    signIn();
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalled();
    });

    expect(getSession()?.tokens.access_token).toBe("access-token-value");

    // The refresh token is dropped on arrival and never enters this bundle's memory: the
    // dashboard's durable credential is the `HttpOnly` cookie, and a second script-readable copy
    // of it would hand an XSS exactly what that cookie exists to deny.
    expect(JSON.stringify(getSession())).not.toContain("refresh-token-value");

    // The whole point of the in-memory store: an XSS on this dashboard must not find a token that
    // reads a whole organisation's aggregate HR data. This fails the moment anyone "helpfully"
    // persists the session.
    const stored = Object.keys(window.localStorage)
      .concat(Object.keys(window.sessionStorage))
      .map((key) => window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key) ?? "");
    for (const value of stored) {
      expect(value).not.toContain("access-token-value");
      expect(value).not.toContain("refresh-token-value");
    }
    expect(document.cookie).toBe("");
  });

  it("disables the button and announces itself while the request is in flight", async () => {
    let release: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    const { container } = render(<LoginPage />);

    signIn();

    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector("form")?.getAttribute("aria-busy")).toBe("true");

    // A second click while in flight must not produce a second request.
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release?.(jsonResponse(200, session("hr_admin")));
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalled();
    });
  });
});

describe("login screen — failure", () => {
  it("shows a rejected sign-in in an alert without saying whether the account exists", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, envelope("invalid_credentials", "That email address and password do not match.")),
    );
    render(<LoginPage />);

    signIn();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Sign-in failed.")).toBeDefined();
    expect(alert.textContent).toContain("That email address and password do not match.");

    // RAG.md §12.3: the copy must be the same whether or not the address has an account, so it may
    // not contain any of the words that would give that away.
    const copy = (alert.textContent ?? "").toLowerCase();
    for (const tell of ["no account", "unknown", "not found", "does not exist", "unregistered"]) {
      expect(copy).not.toContain(tell);
    }

    expect(nav.replace).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
  });

  it("moves focus into the alert so a keyboard user lands on the reason", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("invalid_credentials", "no")));
    render(<LoginPage />);

    signIn();

    const alert = await screen.findByRole("alert");
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
  });

  it("tells a locked-out account something different from a wrong password", async () => {
    fetchMock.mockResolvedValue(jsonResponse(423, envelope("account_locked", "locked"), { "Retry-After": "900" }));
    render(<LoginPage />);

    signIn();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many sign-in attempts");
  });

  it("renders a rate-limit refusal as copy, not as a raw 429", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, envelope("rate_limited", "slow down"), { "Retry-After": "30" }));
    render(<LoginPage />);

    signIn();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many attempts from this device");
  });

  it("survives a transport failure instead of surfacing a raw fetch error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginPage />);

    signIn();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Kayla is not reachable right now");
    expect(alert.textContent).not.toContain("Failed to fetch");
  });

  it("says nothing about a body it could not parse", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => null },
      json: () => Promise.reject(new SyntaxError("<html>upstream said no</html>")),
    } as unknown as Response);
    render(<LoginPage />);

    signIn();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("upstream");
    expect(alert.textContent).toContain("Kayla is not reachable right now");
  });

  it("re-enables the form after a failure so the attempt can be repeated", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, envelope("invalid_credentials", "no")));
    render(<LoginPage />);

    signIn();
    await screen.findByRole("alert");

    const button = screen.getByRole("button", { name: "Sign in" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("login screen — surface separation (agents.md §6.2 layer 1)", () => {
  it("refuses a worker's session and keeps none of it", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, session("worker")));
    render(<LoginPage />);

    signIn();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Kayla app for workers");
    expect(nav.replace).not.toHaveBeenCalled();

    // The backend already made that token structurally useless here by giving it the worker
    // audience; this asserts the dashboard does not sit on a credential it must never send.
    expect(getSession()).toBeNull();
  });

  it("refuses a role that is not a login in the MVP", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, session("manager")));
    render(<LoginPage />);

    signIn();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("cannot sign in");
    expect(getSession()).toBeNull();
  });
});
