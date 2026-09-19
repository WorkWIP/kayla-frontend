"use client";

/**
 * The `<label>` + `<input>` + error-`<p>` + `useId` quadruple, assembled once.
 *
 * It was hand-built three times before this file: twice in `login-form.tsx` (email, password)
 * and once, inside a `.map()`, in `(dashboard)/settings/page.tsx`. All three got the wiring
 * right, which is exactly why it is worth extracting — the next one would not have.
 *
 * The contract the tests already pin, and this file keeps:
 *  - a real `<label for>` pointing at a real `<input id>`, never a wrapping label
 *    (`login/page.test.tsx`: "binds each label to its input with for/id rather than by
 *    wrapping"),
 *  - `aria-invalid` is always present, "false" when the field is fine — not absent,
 *  - `aria-describedby` is absent when there is nothing to describe, and when there IS an error
 *    it points at exactly one element whose whole text is the error (the login test reads it
 *    back with `getElementById(...).textContent` and compares the string),
 *  - `min-h-48`, the first step of the spacing scale at or above WCAG's 44-pixel target.
 */

import { useId } from "react";
import type { InputHTMLAttributes, Ref } from "react";

const INPUT_CLASS =
  "min-h-48 w-full rounded-control border border-lilac-400 bg-surface-card px-16 text-body text-text-primary focus-visible:border-border-focus focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum";

interface FieldShellProps {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly inputId: string;
  readonly hintId: string;
  readonly errorId: string;
  readonly children: React.ReactNode;
}

function FieldShell({ label, hint, error, inputId, hintId, errorId, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-8">
      <label htmlFor={inputId} className="text-field-label font-bold text-text-primary">
        {label}
      </label>
      {hint !== undefined ? (
        <p id={hintId} className="text-meta text-text-secondary">
          {hint}
        </p>
      ) : null}
      {children}
      {error !== undefined ? (
        // role="alert" because this appears in response to an action the person just took, and
        // it is the only announcement they get that the submit did not go through.
        // Near-black ink, not persimmon: `--color-status-critical` (persimmon-500) does not
        // reach 4.5:1 on a white card, and colour is never the only signal here anyway —
        // `aria-invalid`, the live announcement and the sentence itself all carry it.
        <p id={errorId} role="alert" className="text-copy text-text-primary">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** `[hintId?, errorId?]`, or `undefined` when there is nothing to point at. */
function describedBy(hasHint: boolean, hasError: boolean, hintId: string, errorId: string): string | undefined {
  const ids = [hasHint ? hintId : null, hasError ? errorId : null].filter(
    (id): id is string => id !== null,
  );
  return ids.length === 0 ? undefined : ids.join(" ");
}

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "value" | "onChange" | "aria-invalid" | "aria-describedby" | "type"
>;

export interface TextFieldProps extends NativeInputProps {
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly type?: "text" | "email" | "password" | "search" | "tel" | "url";
  readonly hint?: string;
  readonly error?: string;
  /** Supply one when the field has to be focused programmatically (login does, on a failure). */
  readonly inputRef?: Ref<HTMLInputElement>;
  /** Only when the id has to be known outside — otherwise one is generated. */
  readonly id?: string;
}

export function TextField({
  label,
  value,
  onValueChange,
  type = "text",
  hint,
  error,
  inputRef,
  id,
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      inputId={inputId}
      hintId={hintId}
      errorId={errorId}
    >
      <input
        {...rest}
        ref={inputRef}
        id={inputId}
        type={type}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(hint !== undefined, error !== undefined, hintId, errorId)}
        className={INPUT_CLASS}
      />
    </FieldShell>
  );
}

export interface NumberFieldProps
  extends Omit<NativeInputProps, "min" | "max" | "step" | "inputMode"> {
  readonly label: string;
  /**
   * A string, not a number — the field must be able to hold "" and "1x" while it is being typed,
   * and turning those into `NaN` on every keystroke is how a number input eats what you typed.
   * Parsing is the caller's, next to its own bounds.
   */
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly hint?: string;
  readonly error?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly id?: string;
}

export function NumberField({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  hint,
  error,
  inputRef,
  id,
  ...rest
}: NumberFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      inputId={inputId}
      hintId={hintId}
      errorId={errorId}
    >
      <input
        {...rest}
        ref={inputRef}
        id={inputId}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(hint !== undefined, error !== undefined, hintId, errorId)}
        className={INPUT_CLASS}
      />
    </FieldShell>
  );
}

export default TextField;
