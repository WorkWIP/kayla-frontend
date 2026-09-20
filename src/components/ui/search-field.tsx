"use client";

/**
 * The toolbar search box.
 *
 * --------------------------------------------------------------------------------------------
 * Why not `TextField`
 * --------------------------------------------------------------------------------------------
 * `field.tsx`'s `TextField` is a *form* control: it always draws a visible `<label>` above the
 * input and reserves room beneath for a hint and an error. That is exactly right in a form and
 * exactly wrong in a toolbar, where the control sits inline beside buttons, the label would be a
 * stray word above a filter row, and there is no such thing as a validation error.
 *
 * So this is a sibling, not a variant. `FieldShell`'s label/`for`/`aria-describedby` contract is
 * pinned by `ui.test.tsx`; bending it to render label-less would put a toolbar's needs inside a
 * form primitive and risk both.
 *
 * --------------------------------------------------------------------------------------------
 * Search is a first-class control, not a nicety
 * --------------------------------------------------------------------------------------------
 * It is the single most repeated recommendation across koruux's healthcare-UI survey — "ensure
 * capability to search for a record with a variety of keywords", auto-suggestion, multi-criteria
 * filtering. Every list screen in this dashboard previously offered no way to narrow anything.
 *
 * Filtering is done by the calling page, in memory, over data it already has. No screen here
 * pages its list, so there is nothing to ask the server for.
 *
 * --------------------------------------------------------------------------------------------
 * Accessibility
 * --------------------------------------------------------------------------------------------
 * - `type="search"`, so the control is announced as a search field and gets the platform's own
 *   clear affordance.
 * - The label is real and bound by `for`/`id` — `sr-only`, never dropped. A placeholder is not a
 *   label: it disappears on first keystroke and is not announced by every screen reader.
 * - The glyph is `aria-hidden` and the input carries the padding that keeps text clear of it.
 * - `min-h-48` — the first spacing step at or above WCAG's 44-unit target, same as every other
 *   control in this app.
 */

import { useId } from "react";

/**
 * Full width on a phone, 320 on anything wider.
 *
 * Composed from tokens rather than written as a literal, like the rail's own `RAIL_WIDE`. Note
 * that `w-80` would be **80 pixels** here, not 20rem: this project resets Tailwind's spacing
 * scale to the design system's twelve steps, all of which are literal pixel values. That trap is
 * exactly why the width lives in this component once instead of at each call site.
 */
const FIELD_WIDTH = "w-full sm:w-[calc(var(--spacing-80)*4)]";

export interface SearchFieldProps {
  /** Visually hidden, but always present and bound to the input. */
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly className?: string;
}

/** Lucide `search`, at the 20-unit nav size — `agents.md` §5.5: strokes only, `currentColor`. */
function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function SearchField({
  label,
  value,
  onValueChange,
  placeholder,
  className,
}: SearchFieldProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-search`;

  return (
    <div
      className={[`relative flex min-w-[0] items-center ${FIELD_WIDTH}`, className ?? ""]
        .filter((part) => part.length > 0)
        .join(" ")}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <span className="pointer-events-none absolute left-12 flex items-center text-text-tertiary">
        <SearchGlyph />
      </span>
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-48 w-full rounded-control border border-lilac-400 bg-surface-card pl-48 pr-16 text-body text-text-primary focus-visible:border-border-focus focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum"
      />
    </div>
  );
}

export default SearchField;
