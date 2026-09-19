/**
 * The one button treatment in this app.
 *
 * Before this file the canonical class strings lived twice, byte-identically, as
 * `PRIMARY_BUTTON`/`SECONDARY_BUTTON` in `(dashboard)/actions/page.tsx` and
 * `roster-upload-flow.tsx`, and a third, fourth and fifth time inline in `cohorts/page.tsx`,
 * `knowledge-base/page.tsx`, `settings/page.tsx` and `login-form.tsx`. Those exact strings are
 * the starting point here, split into a base / size / variant triple, so nothing shifts
 * visually: `primary` + `size="md"` still resolves to the same declaration list the two
 * constants carried.
 *
 * Why `flex` and not `inline-flex`: that is what the original strings used, and several call
 * sites (`w-full` submit buttons, `w-fit` link-buttons) are laid out around it. Keeping it
 * avoids a silent baseline shift in a dozen places for no gain.
 *
 * `min-h-48` is load-bearing and asserted by `src/app/login/page.test.tsx` — the design system's
 * scale steps 40 -> 48 and 48 is the first step clearing WCAG's 44x44 target minimum.
 */

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const BASE =
  "flex items-center justify-center gap-8 rounded-control font-core text-label font-bold transition-colors duration-[var(--duration-fast)] ease-standard focus-visible:outline-hidden";

const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  /** Secondary density — still a real target, one scale step down from the default. */
  sm: "min-h-40 px-16",
  /** The default everywhere: the original `PRIMARY_BUTTON`'s own sizing. */
  md: "min-h-48 px-24",
};

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary:
    "bg-action-primary text-text-inverse hover:bg-action-primary-hover focus-visible:inset-shadow-focus-mint disabled:bg-action-disabled disabled:text-text-secondary",
  secondary:
    "border border-hairline-lilac bg-surface-card text-text-primary hover:bg-surface-warm-gray focus-visible:inset-shadow-focus-plum disabled:text-text-tertiary",
  ghost:
    "bg-transparent text-text-link hover:bg-surface-warm-gray focus-visible:inset-shadow-focus-plum disabled:text-text-tertiary",
  // The design system ships no destructive fill, only the `status-critical` family — so this is
  // built from that rather than invented. Text is inverse on the solid persimmon, which is the
  // one combination in the palette that clears 4.5:1 for a filled destructive control.
  destructive:
    "bg-status-critical text-text-inverse hover:bg-status-critical focus-visible:inset-shadow-focus-plum disabled:bg-action-disabled disabled:text-text-secondary",
};

export interface ButtonSkinOptions {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** `w-full` instead of the default `w-fit`. */
  readonly fullWidth?: boolean;
  readonly className?: string;
}

/**
 * The class string on its own, for anywhere a real `<button>`/`<a>` is not what is being styled
 * — a file input's `::file-selector-button`, say — and for `ui.test.tsx`, which pins the handful
 * of utilities the call sites this replaced were relying on. Prefer `Button`/`LinkButton`.
 */
export function buttonSkin({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonSkinOptions = {}): string {
  return [BASE, SIZE_CLASS[size], VARIANT_CLASS[variant], fullWidth ? "w-full" : "w-fit", className]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");
}

/**
 * The spinner slot. Rendered — reserved, `invisible` — whenever the caller passes `loading` at
 * all, so a button that can load does not change width at the moment it starts loading. A button
 * that never loads (no `loading` prop) renders no slot and is byte-identical to what shipped
 * before this component existed.
 */
function Spinner({ spinning }: { readonly spinning: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "size-16 shrink-0 rounded-full border-2 border-current border-t-transparent",
        "motion-safe:animate-spin",
        spinning ? "" : "invisible",
      ].join(" ")}
    />
  );
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">,
    ButtonSkinOptions {
  readonly children: ReactNode;
  /**
   * Pass this (even as `false`) to opt into the reserved spinner slot. `true` also disables the
   * button and sets `aria-busy`.
   */
  readonly loading?: boolean;
  /**
   * The label while `loading`. Given, it replaces the children outright, so the button's
   * accessible name becomes this string — which is what `login/page.test.tsx` asserts
   * ("Signing in…"). Omitted, the children stay and only the spinner appears.
   */
  readonly loadingLabel?: string;
  readonly buttonRef?: Ref<HTMLButtonElement>;
}

export function Button({
  children,
  variant,
  size,
  fullWidth,
  className,
  loading,
  loadingLabel,
  disabled,
  type = "button",
  buttonRef,
  ...rest
}: ButtonProps) {
  const isLoading = loading === true;
  return (
    <button
      {...rest}
      ref={buttonRef}
      type={type}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading ? true : undefined}
      className={buttonSkin({ variant, size, fullWidth, className })}
    >
      {loading === undefined ? null : <Spinner spinning={isLoading} />}
      <span>{isLoading && loadingLabel !== undefined ? loadingLabel : children}</span>
    </button>
  );
}

export interface LinkButtonProps extends ButtonSkinOptions {
  readonly href: string;
  readonly children: ReactNode;
  readonly prefetch?: boolean;
}

/**
 * A `<Link>` wearing the button skin. Several pages styled an anchor as a button by hand
 * ("Upload roster", "Upload document", "View cohorts"); this is that, once.
 */
export function LinkButton({ href, children, prefetch, ...skin }: LinkButtonProps) {
  return (
    <Link href={href} prefetch={prefetch} className={buttonSkin(skin)}>
      {children}
    </Link>
  );
}

export default Button;
