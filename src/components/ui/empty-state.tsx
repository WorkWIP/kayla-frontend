/**
 * What a brand-new organisation sees before it has any data.
 *
 * Every page used to answer that with one bare `<p>` ("No cohorts yet.", "No documents yet."),
 * which reads as a broken screen rather than a next step. This gives the same sentence a shape:
 * an optional glyph, a heading, a line of explanation and — the part that was missing everywhere
 * — somewhere to go.
 *
 * Deliberately NOT a live region. `check-in-questions/page.test.tsx` and
 * `engagement/page.test.tsx` both assert `queryByRole("alert")` is null on their empty states:
 * having no data yet is not an error, and announcing it as one would be a lie to a screen
 * reader as much as to the eye.
 */

import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** A 24-pixel stroke glyph, or any small illustration. Decorative — always `aria-hidden`. */
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  /** One `LinkButton`/`Button`, or a couple. */
  readonly action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-12 rounded-card border border-hairline-lilac bg-surface-card p-40 text-center shadow-elevation-card">
      {icon !== undefined ? (
        <span
          aria-hidden="true"
          className="flex size-48 shrink-0 items-center justify-center rounded-full bg-surface-plum-tint text-text-link"
        >
          {icon}
        </span>
      ) : null}
      <p className="text-card-title font-extrabold text-text-primary">{title}</p>
      {description !== undefined ? (
        <p className="max-w-md text-body text-text-secondary">{description}</p>
      ) : null}
      {action !== undefined ? (
        <div className="flex flex-wrap items-center justify-center gap-12">{action}</div>
      ) : null}
    </div>
  );
}

export default EmptyState;
