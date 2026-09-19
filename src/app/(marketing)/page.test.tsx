/**
 * Tests for `/` — the public landing page.
 *
 * The page is a Server Component with no data fetching and no session dependency, so it is
 * rendered directly: there is nothing to mock, and mocking anything here would be mocking the
 * thing under test. Its `metadata` export is asserted as a value for the same reason — it is a
 * plain object, and it is the part of this route that a crawler and a link unfurler actually
 * consume.
 *
 * Every assertion is written to fail when the behaviour it names breaks rather than when the
 * component merely fails to render (agents.md §11.3).
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import LandingPage, { metadata } from "./page";

afterEach(() => {
  cleanup();
});

describe("the landing page", () => {
  it("renders the wordmark as type, with no image and no logo file", () => {
    const { container } = render(<LandingPage />);

    // The brand is type. `kb/design_system/readme.md:294`: "There is no logo file in the
    // source... Do not draw a logo — ask for one." An <img> or an <svg> here would mean one was
    // drawn.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getAllByText("Kayla Health").length).toBeGreaterThan(0);
    // The established app mark: the plum disc carrying the initials, same as the sidebar rail.
    expect(screen.getByText("KH")).not.toBeNull();
  });

  it("has exactly one h1, and it says what the product does", () => {
    render(<LandingPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);

    const headline = headings[0]?.textContent ?? "";
    // Sourced from kb/design_system/readme.md's own opening: who it is for, and what the
    // employer gets. Both halves must survive an edit, because a headline that names only one
    // audience misdescribes the product.
    expect(headline).toContain("frontline healthcare workers");
    expect(headline).toContain("cohort-level metrics");
  });

  it("offers exactly the two CTAs, pointing at /signup and /login", () => {
    render(<LandingPage />);

    const createLink = screen.getByRole("link", { name: "Create your organization" });
    expect(createLink.getAttribute("href")).toBe("/signup");

    // Two routes to sign in — the top-bar soft link and the CTA — and both must land on /login.
    const signInHrefs = screen
      .getAllByRole("link")
      .filter((link) => (link.textContent ?? "").includes("Sign in"))
      .map((link) => link.getAttribute("href"));
    expect(signInHrefs.length).toBeGreaterThan(0);
    expect(new Set(signInHrefs)).toEqual(new Set(["/login"]));
  });

  it("carries the privacy promise as a trust strip, group-level and never individual", () => {
    render(<LandingPage />);

    const strip = screen.getByRole("region", { name: "Who sees what" });
    const text = strip.textContent ?? "";

    // The product's genuine differentiator, drawn from kb/MVP-SPEC.md §5.5 and the worker-facing
    // privacy screen it exists to honour. If the claim half survives but the bounding half is
    // edited away, the page is making a softer promise than the product makes.
    expect(text).toContain("group-level patterns, never an individual");
    expect(text).toContain("Free-text answers never reach the dashboard");
    expect(text).toContain("suppressed below a minimum cohort size");
    // The worker is told the same thing in the app — the reason the dashboard promise is
    // credible at all.
    expect(text).toContain("before they are asked anything");

    // Four bound claims, each a claim plus the sentence that narrows it.
    expect(within(strip).getAllByRole("listitem")).toHaveLength(4);
  });

  it("invents no statistics, customer names, testimonials or prices", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";

    // No bare percentage and no currency figure anywhere. The repo contains no real numbers for
    // this product, and the one ROI model in it is explicitly illustrative, so any digit-led
    // claim on this page would be invented.
    expect(text).not.toMatch(/\d+\s?%/);
    expect(text).not.toMatch(/[$£€]\s?\d/);
    // "90-day journey" is the product's own structure, not a statistic — so the only numeral
    // permitted here is that one.
    const numerals = text.match(/\d+/g) ?? [];
    expect(new Set(numerals)).toEqual(new Set(["90"]));
  });

  it("speaks in the HR-facing register: third person, no reassurance, no emoji", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";

    // kb/design_system/readme.md: "HR dashboard voice shifts to clinical neutrality — third
    // person, no reassurance." First-person plural is the failure mode that copy drifts into.
    expect(text).not.toMatch(/\bwe\b/i);
    expect(text).not.toMatch(/\bour\b/i);
    // The readme permits emoji in exactly one place, the mobile mood scale. Nowhere near here.
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    // "no exclamation" is the same rule, stated the other way round.
    expect(text).not.toContain("!");
  });

  it("exports real metadata, including an OpenGraph card", () => {
    // This is the product's public front door: the title and description have to be in the
    // first HTML response, not assembled by a client bundle.
    expect(metadata.title).toContain("Kayla Health");
    expect(typeof metadata.description).toBe("string");
    expect(metadata.description ?? "").toContain("cohort level");

    const openGraph = metadata.openGraph;
    expect(openGraph).toBeDefined();
    expect(openGraph?.title).toContain("Kayla Health");
    expect(openGraph?.description).toBe(metadata.description);
    expect(openGraph).toMatchObject({ type: "website", siteName: "Kayla Health", url: "/" });

    // Indexable: the landing page is the one public surface that should be. A `robots` entry
    // here would be someone copying the signup pages' metadata by accident.
    expect(metadata.robots).toBeUndefined();
  });
});
