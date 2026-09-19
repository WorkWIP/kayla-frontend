/**
 * One pill, replacing five hand-rolled ones.
 *
 * Before this file: `StatusBadge` (kb-document-card.tsx), `QuestionTypeBadge` and
 * `MilestoneChip` (checkin-question-card.tsx), `NudgeStatusBadge` ((dashboard)/actions/page.tsx),
 * `DiagnosisBadge` (roster-upload-flow.tsx), plus two inline pills in settings/page.tsx and
 * signals/page.tsx. All seven shared the same spine — `rounded-pill px-12 py-4 text-meta
 * font-bold` — and differed only in fill/ink, so that spine is the base here and the difference
 * is the `tone` prop. Each of those modules keeps its own status -> tone mapping: which tone a
 * KB status or a nudge status deserves is domain knowledge, not a UI-kit concern.
 */

import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "positive" | "attention" | "critical" | "accent";
export type BadgeVariant = "solid" | "outline";

const BASE = "inline-flex w-fit items-center rounded-pill px-12 py-4 text-meta";

const SOLID_TONE: Readonly<Record<BadgeTone, string>> = {
  neutral: "bg-surface-warm-gray text-text-secondary",
  positive: "bg-status-positive-subtle text-status-positive",
  attention: "bg-status-attention-subtle text-status-attention",
  critical: "bg-status-critical-subtle text-status-critical",
  accent: "bg-surface-plum-tint text-text-link",
};

/** The `MilestoneChip` shape: a hairline outline and medium weight, no fill. */
const OUTLINE_TONE: Readonly<Record<BadgeTone, string>> = {
  neutral: "border border-hairline-lilac text-text-secondary",
  positive: "border border-status-positive text-status-positive",
  attention: "border border-status-attention text-status-attention",
  critical: "border border-status-critical text-status-critical",
  accent: "border border-hairline-lilac text-text-link",
};

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly variant?: BadgeVariant;
  readonly children: ReactNode;
  /** Layout-only extras from the call site (`shrink-0`, a grid placement). Never colour. */
  readonly className?: string;
}

export function Badge({ tone = "neutral", variant = "solid", children, className }: BadgeProps) {
  return (
    <span
      className={[
        BASE,
        // Solid pills are bold (the original five all were); outline chips are medium, which is
        // what `MilestoneChip` shipped and what keeps a row of day-chips from shouting.
        variant === "solid" ? "font-bold" : "font-medium",
        variant === "solid" ? SOLID_TONE[tone] : OUTLINE_TONE[tone],
        className ?? "",
      ]
        .filter((part) => part.length > 0)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export default Badge;
