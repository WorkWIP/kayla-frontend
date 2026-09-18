import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Home from "./page";

afterEach(() => {
  cleanup();
});

describe("P0 landing page", () => {
  it("names the app in its only level-1 heading", () => {
    render(<Home />);

    const headings = screen.getAllByRole("heading", { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Kayla Health");
  });

  it("reports the environment the bundle was built for", () => {
    render(<Home />);

    const term = screen.getByText("Environment");
    const value = term.parentElement?.querySelector("dd");

    // Supplied by vitest.config.ts, the same way a build supplies it. If src/env.ts ever
    // starts silently defaulting instead of throwing, this is where it shows up.
    expect(value?.textContent).toBe("development");
  });

  it("paints every swatch from a token reference, never a literal colour", () => {
    const { container } = render(<Home />);

    const swatches = Array.from(container.querySelectorAll("[data-token]"));

    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      const token = swatch.getAttribute("data-token");
      expect(token).toMatch(/^--/);
      expect(swatch.getAttribute("style")).toBe(`background: var(${token});`);
    }
  });
});
