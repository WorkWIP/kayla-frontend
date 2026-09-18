import { describe, expect, it, vi } from "vitest";

/**
 * `/` exists only to send people to sign-in. Until recently it was the Phase 0 token-proof page,
 * so app.kaylahealth.com opened on colour swatches — that page now lives at `/debug-tokens` and is
 * covered by its own test.
 *
 * `redirect` throws a control-flow signal rather than returning, which is how Next unwinds a
 * server component. The mock below records the call and rethrows nothing, so the assertion is on
 * the argument rather than on any rendered output — there is none.
 */
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import Home from "./page";

describe("/", () => {
  it("sends visitors to the sign-in page", () => {
    Home();

    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
