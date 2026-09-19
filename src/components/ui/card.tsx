/**
 * The card treatment, which was copy-pasted into seven files verbatim:
 * `rounded-card border border-hairline-lilac bg-surface-card p-24 shadow-elevation-card`.
 *
 * Deliberately no layout of its own. The seven call sites disagree about their internal gap
 * (8, 12 and 16 all appear) and about their direction at `sm`, and folding one of those choices
 * in as a default would just mean six of them overriding it. The card owns the *surface*; the
 * caller owns what sits on it.
 */

import type { ReactNode } from "react";

/** Exported so the one place that needs the string (a focusable tile) can compose it. */
export const CARD_SURFACE =
  "rounded-card border border-hairline-lilac bg-surface-card p-24 shadow-elevation-card";

type CardElement = "div" | "section" | "article" | "li";

export interface CardProps {
  readonly as?: CardElement;
  readonly className?: string;
  readonly children: ReactNode;
  readonly "aria-labelledby"?: string;
  readonly "data-testid"?: string;
  readonly "data-status"?: string;
}

export function Card({ as = "div", className, children, ...rest }: CardProps) {
  const Element = as;
  return (
    <Element {...rest} className={[CARD_SURFACE, className ?? ""].filter((p) => p.length > 0).join(" ")}>
      {children}
    </Element>
  );
}

export default Card;
