"use client";

/**
 * A modal dialog, on the native `<dialog>` element.
 *
 * There was no dialog anywhere in this app before this file, so nothing here is a port of an
 * existing treatment — it is built from the same tokens as every other surface.
 *
 * Native `<dialog>.showModal()` rather than a div-with-`role="dialog"`: it gives the top layer,
 * the inert background, Escape-to-close and the focus trap from the platform instead of from
 * three hundred lines of JavaScript that get them subtly wrong. What this component adds on top:
 *
 *  - a *labelled* heading, wired with `aria-labelledby` — the one thing `showModal()` will not
 *    do for you, and the difference between "dialog" and "Discard this upload, dialog" being
 *    announced,
 *  - initial focus on the dialog's own heading container rather than on whatever control happens
 *    to be first, so the announcement starts at the title,
 *  - a Tab cycle guard, because `showModal()`'s own trap only exists where the element is really
 *    in the top layer; under jsdom (and in the one older engine that ships `<dialog>` without a
 *    top layer) it is not, and a dialog that leaks focus to the page behind it is worse than one
 *    that never opened,
 *  - `onClose` fired for every route out — the close button, Escape, and a click on the
 *    backdrop — so a caller only has to handle one.
 */

import { useCallback, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  readonly open: boolean;
  /** Called for the close button, Escape and a backdrop click alike. */
  readonly onClose: () => void;
  /** The dialog's accessible name, rendered as its `<h2>`. */
  readonly title: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  /** The action row — usually a `Button` or two. */
  readonly footer?: ReactNode;
  /** Copy for the ✕ control's accessible name. */
  readonly closeLabel?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = "Close",
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open) {
      // `showModal` is absent in a few environments this code has to survive (jsdom below 26,
      // and any SSR-adjacent double render). Falling back to the `open` attribute keeps the
      // content reachable rather than throwing.
      if (typeof dialog.showModal === "function" && !dialog.open) {
        dialog.showModal();
      } else if (!dialog.open) {
        dialog.setAttribute("open", "");
      }
      dialog.focus();
    } else if (dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  // Escape reaches `<dialog>` as a `cancel` event, not a keydown the page can see. Intercepting
  // it (rather than letting the default close happen) keeps React state as the single source of
  // truth for whether this dialog is open.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      tabIndex={-1}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        // A click that lands on the <dialog> itself is a backdrop click: every piece of content
        // lives inside the wrapper below, so the element only receives this when the pointer
        // was outside it.
        if (event.target === dialogRef.current) onClose();
      }}
      className="m-auto w-full max-w-md rounded-card-lg border border-hairline-lilac bg-surface-card p-[0] text-text-primary shadow-elevation-card backdrop:bg-text-primary backdrop:opacity-60 focus-visible:outline-hidden"
    >
      <div className="flex flex-col gap-16 p-24">
        <div className="flex items-start justify-between gap-16">
          <div className="flex min-w-[0] flex-col gap-4">
            <h2 id={headingId} className="text-title font-bold text-text-primary">
              {title}
            </h2>
            {description !== undefined ? (
              <p className="text-copy text-text-secondary">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex size-40 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-warm-gray focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum"
          >
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
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        {children !== undefined ? <div className="flex flex-col gap-12">{children}</div> : null}
        {footer !== undefined ? (
          <div className="flex flex-wrap items-center justify-end gap-12">{footer}</div>
        ) : null}
      </div>
    </dialog>
  );
}

export default Modal;
