/**
 * Validated build-time configuration for kayla-frontend.
 *
 * agents.md §7.1: "Startup fails loudly on a missing required var. Never silently default."
 * agents.md §7.4 fixes the variable set; .env.example is the committed copy of it.
 *
 * Two things worth knowing before you edit this file:
 *
 * 1. `NEXT_PUBLIC_*` variables are inlined by the Next.js compiler at BUILD time, and only
 *    when they are read as a literal static property (`process.env.NEXT_PUBLIC_FOO`).
 *    `process.env[name]` with a computed key is NOT replaced and comes back undefined in the
 *    browser, so the reads below are written out one per line on purpose — do not "tidy" them
 *    into a loop.
 * 2. Because the values are baked into the bundle, a missing one is a *build* failure, not a
 *    runtime surprise in production. This module is imported by the root layout and the landing
 *    page, so `next build` fails loudly, naming every offending variable at once.
 *
 * Dependency-free by design: no zod, no runtime validation library. Three variables do not
 * justify a dependency that also has to be kept in step with the backend's Pydantic settings.
 */

/** The deployment environments this app knows about. Extend here, not at the call site. */
const ENVIRONMENTS = ["development", "staging", "production"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

export interface Env {
  /** Absolute base URL of kayla-backend, no trailing path. */
  readonly NEXT_PUBLIC_API_BASE_URL: string;
  /** Absolute public URL this dashboard is served from. */
  readonly NEXT_PUBLIC_APP_URL: string;
  /** Which deployment this bundle was built for. */
  readonly NEXT_PUBLIC_ENVIRONMENT: Environment;
}

type UrlVariable = "NEXT_PUBLIC_API_BASE_URL" | "NEXT_PUBLIC_APP_URL";

// Static reads — see note 1 above.
const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const rawEnvironment = process.env.NEXT_PUBLIC_ENVIRONMENT;

const problems: string[] = [];

function describe(value: string | undefined): string {
  if (value === undefined) return "not set";
  if (value.trim() === "") return "set but empty";
  return JSON.stringify(value);
}

function fail(): never {
  throw new Error(
    [
      "kayla-frontend configuration is invalid — refusing to build or start.",
      ...problems.map((problem) => `  - ${problem}`),
      "",
      "Fix: copy kayla-frontend/.env.example to kayla-frontend/.env.local and fill it in,",
      "or export the variables in the build environment. See agents.md §7.1 and §7.4.",
    ].join("\n"),
  );
}

function readHttpUrl(name: UrlVariable, value: string | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") {
    problems.push(`${name} is required — ${describe(value)}.`);
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    problems.push(`${name} must be an absolute URL such as http://localhost:8000 — got ${describe(value)}.`);
    return trimmed;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    problems.push(`${name} must use http: or https: — got protocol ${JSON.stringify(parsed.protocol)}.`);
  }

  return trimmed;
}

const apiBaseUrl = readHttpUrl("NEXT_PUBLIC_API_BASE_URL", rawApiBaseUrl);
const appUrl = readHttpUrl("NEXT_PUBLIC_APP_URL", rawAppUrl);

// `find` rather than a cast: it narrows `environment` to Environment, so nothing downstream
// has to trust a type assertion.
const environment = ENVIRONMENTS.find((candidate) => candidate === rawEnvironment?.trim());

if (environment === undefined) {
  problems.push(
    `NEXT_PUBLIC_ENVIRONMENT must be one of ${ENVIRONMENTS.join(" | ")} — got ${describe(rawEnvironment)}.`,
  );
  fail();
}

if (problems.length > 0) {
  fail();
}

/** The only supported way to read configuration in this app. */
export const env: Env = Object.freeze({
  NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
  NEXT_PUBLIC_APP_URL: appUrl,
  NEXT_PUBLIC_ENVIRONMENT: environment,
});
