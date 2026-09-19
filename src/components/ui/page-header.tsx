/**
 * Eyebrow + `<h1>` + description + an actions slot — the block every one of the ten dashboard
 * pages re-inlined, down to the same `max-w-md` on the description and the same
 * `text-eyebrow font-bold uppercase tracking-eyebrow` on the kicker.
 *
 * Exactly one `<h1>` per page comes out of here, which is what
 * `cohorts/upload/page.test.tsx` and `knowledge-base/upload/page.test.tsx` assert
 * (`getAllByRole("heading", { level: 1 })` must have length 1).
 */

import Link from "next/link";
import type { ReactNode } from "react";

export interface PageHeaderBackLink {
  readonly href: string;
  readonly label: string;
}

export interface PageHeaderProps {
  /** The section this page belongs to — "Cohorts", "Knowledge Base", … */
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: ReactNode;
  /** Right-hand slot: a `LinkButton`, a `Button`, or several. */
  readonly actions?: ReactNode;
  /** Rendered above the eyebrow, for a page that is a child of another one. */
  readonly backLink?: PageHeaderBackLink;
}

export function PageHeader({ eyebrow, title, description, actions, backLink }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-16">
      <div className="flex min-w-[0] flex-col gap-8">
        {backLink !== undefined ? (
          <Link
            href={backLink.href}
            className="w-fit text-label font-medium text-text-link underline underline-offset-2"
          >
            {backLink.label}
          </Link>
        ) : null}
        <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
          {eyebrow}
        </p>
        <h1 className="text-display-2 text-text-primary">{title}</h1>
        {description !== undefined ? (
          <p className="max-w-md text-body text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions !== undefined ? (
        <div className="flex shrink-0 flex-wrap items-center gap-12">{actions}</div>
      ) : null}
    </header>
  );
}

export default PageHeader;
