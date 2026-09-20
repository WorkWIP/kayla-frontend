/**
 * The frame every dashboard screen renders inside.
 *
 * --------------------------------------------------------------------------------------------
 * The problem it solves
 * --------------------------------------------------------------------------------------------
 * Eleven screens each opened with their own copy of
 * `mx-auto flex w-full max-w-5xl flex-col gap-24 p-32` — except Settings and the two upload
 * pages, which said `max-w-3xl` instead. Two consequences, both visible:
 *
 * 1. **Screens were not the same size as each other.** Moving from Cohorts to Settings moved the
 *    left edge of the content. Nothing announced it; it just felt unsteady.
 * 2. **Most of a large display was empty.** With the shell's rail and padding on the left and a
 *    1024-unit cap in the middle, a 1920-wide display spent roughly three hundred units of dead
 *    margin on each side. A dashboard whose job is comparison had nowhere to put a second column.
 *
 * Making the width a property of one component rather than a convention eleven files remember is
 * what makes "every screen is the same" true by construction instead of by inspection.
 *
 * --------------------------------------------------------------------------------------------
 * Fluid, with the measure kept where it matters
 * --------------------------------------------------------------------------------------------
 * There is **no `max-width` on the page**. `kb/design_system/readme.md` §Layout does specify a
 * max content width of just over a thousand units, and this is a deliberate departure from that
 * one line: the brief is
 * to use the whole display. The readability concern the cap existed to serve is answered instead
 * where it actually bites — on *prose*. `PageHeader` already caps its description at `max-w-md`,
 * and the long explanatory paragraphs on these screens keep a measure of their own. Tables, tile
 * grids and charts have no such limit, because a wide table is a better table.
 *
 * Everything else in §Layout is untouched: the 232/64 rail, the 16-unit grid gap, card padding.
 *
 * --------------------------------------------------------------------------------------------
 * The regions, and why the aside is one of them
 * --------------------------------------------------------------------------------------------
 *   header   title, description, actions — a `PageHeader`, passed in
 *   toolbar  search and filters, the controls that narrow what is below
 *   tabs     a `Tabs` strip, when the screen divides into named sets
 *   body     the primary workspace
 *   aside    supplementary context
 *
 * That split — list and navigation left, workspace centre, context right — is the single most
 * repeated arrangement in koruux's healthcare-UI survey: recent-visit panels, interaction
 * history, patient profile and vitals all live in a right rail beside the thing being worked on.
 * It is also what finally gives the reclaimed width something to hold.
 *
 * The header region is **sticky**. In the new shell only `<main>` scrolls, so a sticky header
 * inside it keeps the page's title, its filters and its tabs on screen while a long table moves
 * underneath — which is the point of having filters at all.
 *
 * Below `2xl` the aside **stacks beneath the body** rather than narrowing, and `2xl` rather than
 * `xl` is a measured choice. At 1280 the rail, the page padding and a 320-unit aside leave about
 * 640 for the content — which a six-column roster table cannot use without scrolling sideways
 * under the panel. At 1536 the same content has about 900, which it can. A context panel
 * squeezed beside a table it is crowding is worse than the same panel full-width beneath it, and
 * the brief is explicit that nothing may be cut off at either edge.
 *
 * --------------------------------------------------------------------------------------------
 * What this component deliberately does not render
 * --------------------------------------------------------------------------------------------
 * - **No `<main>`.** `DashboardShell` owns the only one, and `dashboard-shell.test.tsx` reads
 *   `getByRole("main")` in the singular.
 * - **No `<h1>`.** `PageHeader` owns it, and four page tests require exactly one per page.
 * - **No `role="status"`.** Each page keeps its own single `PageSkeleton`; a second live region
 *   would make nine `getByRole("status")` assertions ambiguous, and a *permanent* one would hang
 *   the route crawler, which waits for the status node to disappear before it reads a page.
 *
 * It is a Server Component: it holds no state and no handlers, so it adds nothing to the bundle
 * of the client pages that render inside it.
 */

import type { ReactNode } from "react";

/**
 * 320 — four steps of 80. There is no width token, and the design system names no measurement
 * for a context rail, so it is composed from tokens rather than written as a bare number; the
 * rail's own `RAIL_WIDE` in `sidebar-nav.tsx` is built the same way and for the same reason.
 */
const ASIDE_WIDE = "2xl:w-[calc(var(--spacing-80)*4)]";

export type AppPageWidth = "fluid" | "form";

export interface AppPageProps {
  /** A `PageHeader`. Passed rather than composed so the header keeps its own tested contract. */
  readonly header: ReactNode;
  /** Search and filter controls, directly under the header and inside the sticky region. */
  readonly toolbar?: ReactNode;
  /** A `Tabs` strip. Also sticky — a tab you cannot see is a tab you forget you are inside. */
  readonly tabs?: ReactNode;
  /** The right-hand context panel. Beside the body at `xl`, stacked beneath it below that. */
  readonly aside?: ReactNode;
  /**
   * Names the `aside` landmark. Required whenever `aside` is given: a `complementary` region
   * with no name is one a screen-reader user has to enter to identify.
   */
  readonly asideLabel?: string;
  /**
   * `fluid` (default) fills the width. `form` caps the body at a form's natural measure — for
   * the upload flows, where a full-width file input would be absurd. The *chrome* is identical
   * either way, which is the whole point: same header, same padding, same left edge.
   */
  readonly width?: AppPageWidth;
  readonly children: ReactNode;
}

export function AppPage({
  header,
  toolbar,
  tabs,
  aside,
  asideLabel,
  width = "fluid",
  children,
}: AppPageProps) {
  const hasStickyExtras = toolbar !== undefined || tabs !== undefined;

  return (
    <div className="flex min-h-full min-w-[0] flex-col">
      {/* `top-[0]`, not `top-0`: the spacing scale is reset, so there is no `0` step and the
          arbitrary value is the only spelling that compiles. Same reason `px-[0]` appears in
          the rail. */}
      <div
        className={[
          "sticky top-[0] z-10 flex min-w-[0] flex-col gap-16 border-b border-hairline-lilac",
          "bg-surface-page px-24 pt-24 lg:px-32",
          hasStickyExtras ? "pb-16" : "pb-24",
        ].join(" ")}
      >
        {header}
        {toolbar === undefined ? null : (
          <div className="flex min-w-[0] flex-wrap items-center gap-12">{toolbar}</div>
        )}
        {tabs}
      </div>

      <div className="flex min-w-[0] flex-1 flex-col gap-24 px-24 py-24 lg:px-32 2xl:flex-row 2xl:items-start">
        <div
          className={[
            "flex min-w-[0] flex-1 flex-col gap-24",
            width === "form" ? "max-w-2xl" : "",
          ]
            .filter((part) => part.length > 0)
            .join(" ")}
        >
          {children}
        </div>

        {aside === undefined ? null : (
          /*
            `empty:hidden` is load-bearing, not tidiness.

            A panel can be *given* and still render nothing — Overview's getting-started checklist
            returns `null` the moment all three steps are done, which is the common case for any
            established customer. Without this the `<aside>` stayed in the layout as an empty
            320-unit column, and the page it was meant to sit beside silently lost that width:
            six KPI tiles laid out for 1624 units drew into 1280 and the long ones overflowed.

            `:empty` matches an element with no element *and* no text children, which is exactly
            "this panel rendered nothing". `display: none` also takes the labelled `complementary`
            landmark out of the accessibility tree, so a screen reader is not offered a region
            with nothing in it.
          */
          <aside
            aria-label={asideLabel}
            className={`flex w-full shrink-0 flex-col gap-16 empty:hidden 2xl:sticky 2xl:top-24 ${ASIDE_WIDE}`}
          >
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}

export default AppPage;
