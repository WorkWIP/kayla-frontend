/**
 * One row of the org's active check-in question set, on `/check-in-questions` (agents.md §10.9
 * task 7).
 *
 * --------------------------------------------------------------------------------------------
 * Never a hardcoded construct list — this file is the fitness-test-sensitive part of the screen
 * --------------------------------------------------------------------------------------------
 * agents.md §10.9's own fitness test for this phase is that the five construct ids (and their
 * labels, and their milestone bindings) appear in exactly ONE place in the whole system —
 * `kayla.checkin.constructs` (backend-owned, read directly to confirm before writing this file).
 * `GET /checkins/question-sets/active` (`kayla.checkin.schemas.ActiveQuestionSetQuestion`) never
 * sends a label, only `construct_id`, `question_type`, `milestone_days` and `display_order` —
 * deliberately, per that schema's own module docstring. So this component never imports or
 * switches on a specific construct id (no `if (constructId === "role_clarity")`, no
 * `Record<string, string>` keyed by the five ids): `humanizeConstructId` below is a pure string
 * transform that turns whatever `construct_id` the API sends into a readable label — it has
 * exactly the same output for a sixth construct a future org adds as for any of today's five,
 * which is the whole point. `question_type` and the "Day N" milestone chips are the two
 * exceptions, and neither violates the rule: `CheckinQuestionType` is a fixed two-member enum
 * (`scale` / `free_text`) that describes response *shape*, not business meaning, so labelling its
 * two members is the same kind of enum-to-copy mapping `kb-document-card.tsx`'s own
 * `STATUS_TONE` and `@/components/ui/badge` already do for `KbDocumentStatus`; milestone days are rendered
 * verbatim as `Day ${n}`, a formatter over whatever numbers arrive, never a hardcoded day list.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export type CheckinQuestionType = "scale" | "free_text";

/** One row of `ActiveQuestionSetResponse.questions`, read via `src/api/generated.ts` at the call
 * site rather than re-declared here — this interface exists only so this file does not import
 * `components["schemas"][...]` for a shape this simple. Keep it structurally identical to
 * `ActiveQuestionSetQuestion` (`kayla-backend/src/kayla/checkin/schemas.py`). */
export interface CheckinQuestion {
  readonly id: string;
  readonly construct_id: string;
  readonly question_type: CheckinQuestionType;
  readonly milestone_days: readonly number[];
  readonly display_order: number;
}

/**
 * `construct_id` -> a readable label, without knowing what any specific id means.
 *
 * `"role_clarity"` -> `"Role clarity"`, `"other_concerns"` -> `"Other concerns"` — underscores
 * become spaces, and only the first character is capitalised (sentence case, matching this
 * screen's other copy), never per-word title case that would need a stopword list to look right
 * ("Manager Support" reads fine either way; a hypothetical future id like
 * "time_off_and_pay" would not). See the module docstring for why this is a transform, not a
 * lookup table.
 */
export function humanizeConstructId(constructId: string): string {
  const spaced = constructId.replace(/_/g, " ").trim();
  if (spaced.length === 0) return constructId;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const QUESTION_TYPE_LABEL: Readonly<Record<CheckinQuestionType, string>> = {
  scale: "Scale response (0–100)",
  free_text: "Free text",
};

/** Same pill treatment `kb-document-card.tsx`'s `StatusBadge` uses, in the one neutral tone this
 * screen needs — a question type is a fact, not a status, so it never earns the positive/
 * attention/critical tones that file reserves for those. */
function QuestionTypeBadge({ questionType }: { readonly questionType: CheckinQuestionType }) {
  return <Badge>{QUESTION_TYPE_LABEL[questionType]}</Badge>;
}

function MilestoneChip({ day }: { readonly day: number }) {
  return <Badge variant="outline">{`Day ${day}`}</Badge>;
}

export interface CheckinQuestionCardProps {
  readonly question: CheckinQuestion;
  /** 1-based position in the ordered list this card renders inside — `display_order` made
   * visible, without this component needing to know it is item N out of a total it cannot see. */
  readonly position: number;
}

export function CheckinQuestionCard({ question, position }: CheckinQuestionCardProps) {
  const label = humanizeConstructId(question.construct_id);
  const milestoneCaption =
    question.milestone_days.length === 0 ? "No milestones configured" : null;

  return (
    <Card as="li" className="flex flex-col gap-12 sm:flex-row sm:items-start sm:gap-16">
      <span
        aria-hidden="true"
        className="flex size-32 shrink-0 items-center justify-center rounded-full bg-surface-warm-gray text-meta font-bold text-text-secondary"
      >
        {position}
      </span>
      <div className="flex min-w-[0] flex-1 flex-col gap-8">
        <div className="flex flex-col gap-4">
          <p className="text-card-title font-extrabold text-text-primary">{label}</p>
          {/* The raw wire value, for an admin who needs the exact id (support, a bug report) —
           * shown as a caption under the humanized label, never in place of it. */}
          <p className="truncate text-meta text-text-tertiary">{question.construct_id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-8">
          <QuestionTypeBadge questionType={question.question_type} />
          {question.milestone_days.map((day) => (
            <MilestoneChip key={day} day={day} />
          ))}
          {milestoneCaption !== null ? (
            <span className="text-meta text-text-tertiary">{milestoneCaption}</span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default CheckinQuestionCard;
