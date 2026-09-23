"use client";

/**
 * The org-logo upload control (whitelabel PRD Phase 2, task "Build a logo upload component"):
 * pick-or-drop, preview before anything is sent, then presign -> PUT -> confirm.
 *
 * --------------------------------------------------------------------------------------------
 * Adapted from `kb-upload-flow.tsx`, and what changed
 * --------------------------------------------------------------------------------------------
 * The three-call shape is identical to that file's own docstring: `POST .../logo/presign` (plain
 * JSON: content type + size, never the bytes), a raw `PUT` straight to the presigned URL (this
 * API process never sees the file), then `POST .../logo/confirm` once the PUT lands — nothing is
 * persisted server-side until that last call, so a cancelled or failed PUT leaves no orphaned row
 * to clean up (the presigned URL simply expires unused).
 *
 * Two real differences, both because a logo is not a knowledge-base document:
 *
 * 1. **Image preview.** `kb-upload-flow.tsx` has none — a PDF has no useful inline preview and the
 *    brief for that flow never asked for one. A logo is exactly the kind of file where "did I pick
 *    the right one" matters before committing to an upload, so this renders the picked file (or,
 *    once one exists, the org's already-saved logo) as an actual `<img>`, letterboxed inside a
 *    square box — the same "logos are not guaranteed to be square" concern the PRD raises for the
 *    favicon renderer applies here too, and `object-contain` inside a fixed box is the same
 *    non-distorting answer without a canvas.
 * 2. **Client-side validation runs before anything else**, not just before the request that would
 *    fail — `validateLogoFile` (`src/lib/branding.ts`) rejects the wrong content type or an
 *    oversized file the instant it is picked or dropped, with zero network calls made. Real
 *    enforcement still lives on the server (`kayla.branding.storage`'s allowlist and 5&nbsp;MB
 *    cap, re-checked against the real bytes at `.../confirm`); this is the "clear inline error
 *    before any network request" acceptance criterion, nothing more.
 *
 * --------------------------------------------------------------------------------------------
 * Why this exposes `submit()` through a ref instead of rendering its own "Upload" button
 * --------------------------------------------------------------------------------------------
 * The onboarding step needs one "Save & finish" button that saves the display name *and* uploads
 * a newly-picked logo together, in whichever combination the person actually filled in — a button
 * that lives on `LogoUploadField` itself could not also gate the sibling text field's own save.
 * `useImperativeHandle` lets the parent decide when the network calls fire while this component
 * keeps owning file selection, preview and its own upload progress/error UI. The Settings section
 * uses the same ref from its own, separate "Save changes" button — one control, two call sites,
 * no duplicated upload logic between them.
 *
 * `hasSelection` lets a caller show a `disabled`/plain "Save" when there is nothing new to upload,
 * and `reset()` clears a selection a caller decided not to keep (e.g. after "Remove logo").
 *
 * --------------------------------------------------------------------------------------------
 * Plain `<img>`, not `next/image`
 * --------------------------------------------------------------------------------------------
 * `next/image` refuses an external `src` whose hostname is not in `next.config.ts`'s
 * `images.remotePatterns`, and a logo's real URL is an org-scoped object-storage key served from
 * whichever bucket/host this deployment's `kayla-backend` happens to use (MinIO in development,
 * DigitalOcean Spaces in production) — not one fixed hostname this repo could commit to ahead of
 * time. `brand-mark.tsx` already sidesteps the same tradeoff for the *local* Kayla asset by using
 * a CSS mask instead of `next/image`; a plain `<img>` with an `onError` fallback is the equivalent
 * choice for a *remote*, per-org one — no config drift, and one broken URL never breaks the page.
 *
 * --------------------------------------------------------------------------------------------
 * Why the PUT step uses `XMLHttpRequest`
 * --------------------------------------------------------------------------------------------
 * Identical reasoning to `kb-upload-flow.tsx`: `fetch` cannot report upload progress, and
 * `xhr.upload.onprogress` is the one accessible way to drive a real `role="progressbar"`.
 */

import type { ChangeEvent, DragEvent, Ref } from "react";
import { useEffect, useId, useImperativeHandle, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest } from "@/api/client";
import type { BrandingResponse } from "@/lib/branding";
import { LOGO_ACCEPTED_TYPES, brandingErrorMessage, validateLogoFile } from "@/lib/branding";

const ACCEPT_ATTR = LOGO_ACCEPTED_TYPES.join(",");

const GENERIC_UPLOAD_FAILURE = "Could not upload this logo. Try again in a moment.";

interface Selection {
  readonly file: File;
  readonly previewUrl: string;
}

type UploadPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "uploading"; readonly percent: number }
  | { readonly kind: "confirming" }
  | { readonly kind: "error"; readonly message: string };

/** The one request in this flow that never goes through `kayla-backend` — see the module
 * docstring. Mirrors `kb-upload-flow.tsx`'s own helper of the same name field-for-field. */
function putFileWithProgress(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(
        new ApiError({
          status: xhr.status,
          code: CLIENT_ERROR_CODES.responseNotUnderstood,
          message: "The file storage service refused this upload.",
        }),
      );
    };
    xhr.onerror = () => {
      reject(
        new ApiError({
          status: 0,
          code: CLIENT_ERROR_CODES.networkUnreachable,
          message: "Could not reach the file storage service.",
        }),
      );
    };
    xhr.send(file);
  });
}

export interface LogoUploadHandle {
  /** Whether a new file is picked and waiting to be uploaded. */
  readonly hasSelection: boolean;
  /**
   * Runs presign -> PUT -> confirm for the currently-selected file. Resolves to the fresh
   * `BrandingResponse` on success, or `null` when nothing was selected (a no-op the caller can
   * treat as "there was nothing new to save" rather than a special case). Rejects with the same
   * `ApiError` this component already rendered inline, so a caller coordinating a second request
   * (e.g. a display-name `PATCH`) knows to stop rather than continue on a half-finished save.
   */
  submit(): Promise<BrandingResponse | null>;
  /** Drops any picked-but-not-yet-uploaded file and its preview. */
  reset(): void;
}

export interface LogoUploadFieldProps {
  /** The org's already-saved logo, shown until a new file is picked. `null`/omitted renders the
   * empty box — this component has no opinion about a default Kayla mark; callers that want one
   * render `BrandMark` themselves alongside this field. */
  readonly currentLogoUrl?: string | null;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly uploadRef?: Ref<LogoUploadHandle>;
  /**
   * Mirrors `hasSelection` into the caller's own state whenever it changes — e.g. so a "Save"
   * button elsewhere on the page can enable itself once a file is picked. A callback rather than
   * making the caller read `uploadRef.current.hasSelection` during render: this project's lint
   * rules (React Compiler-era `react-hooks/refs`) refuse a ref read during render outright, since
   * it defeats memoization — reads belong in event handlers and effects, and this is the effect.
   */
  readonly onSelectionChange?: (hasSelection: boolean) => void;
}

export function LogoUploadField({
  currentLogoUrl = null,
  disabled = false,
  label = "Logo",
  uploadRef,
  onSelectionChange,
}: LogoUploadFieldProps) {
  const fieldId = useId();
  const inputId = `${fieldId}-file`;
  const hintId = `${fieldId}-hint`;

  const [selection, setSelection] = useState<Selection | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    onSelectionChange?.(selection !== null);
    // `onSelectionChange` is intentionally excluded: an inline arrow function at the call site
    // would otherwise re-fire this on every render of the *caller*, not just when the selection
    // itself changes. Callers that need the latest closure read it from their own state, set here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // Object URLs are revoked on the way out — a leaked one holds the decoded image in memory for
  // the life of the tab, which a settings screen a person can revisit indefinitely should not do.
  // The cleanup closes over this render's `selection`, so it fires exactly once per object URL:
  // when a *new* selection replaces it, and again on unmount for whichever one is current then.
  useEffect(() => {
    return () => {
      if (selection !== null) URL.revokeObjectURL(selection.previewUrl);
    };
  }, [selection]);

  function pickFile(file: File | null | undefined) {
    if (!file || disabled) return;
    const problem = validateLogoFile(file);
    if (problem !== null) {
      setValidationError(problem);
      return;
    }
    setValidationError(null);
    setImageFailed(false);
    if (phase.kind === "error") setPhase({ kind: "idle" });
    // The effect above revokes whichever URL this replaces — see its own comment for why
    // revocation lives there and not here.
    setSelection({ file, previewUrl: URL.createObjectURL(file) });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    pickFile(event.target.files?.[0]);
    // Clears the native input's own value so picking the *same* filename again after a reset (or
    // after this same file failed validation) still fires a change event.
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    pickFile(event.dataTransfer.files?.[0]);
  }

  useImperativeHandle(
    uploadRef,
    () => ({
      hasSelection: selection !== null,
      reset() {
        setSelection(null);
        setValidationError(null);
        setImageFailed(false);
        setPhase({ kind: "idle" });
      },
      async submit() {
        if (selection === null) return null;
        const { file } = selection;
        setPhase({ kind: "uploading", percent: 0 });
        try {
          const presign = await apiRequest("post", "/dashboard/settings/branding/logo/presign", {
            body: { content_type: file.type, size: file.size },
          });
          await putFileWithProgress(presign.upload_url, file, file.type, (percent) => {
            setPhase({ kind: "uploading", percent });
          });
          setPhase({ kind: "confirming" });
          const branding = await apiRequest("post", "/dashboard/settings/branding/logo/confirm", {
            body: { storage_key: presign.storage_key },
          });
          setSelection(null);
          setPhase({ kind: "idle" });
          return branding;
        } catch (error) {
          const message = brandingErrorMessage(error, GENERIC_UPLOAD_FAILURE);
          setPhase({ kind: "error", message });
          throw error;
        }
      },
    }),
    [selection],
  );

  const busy = disabled || phase.kind === "uploading" || phase.kind === "confirming";
  const previewSrc = selection?.previewUrl ?? currentLogoUrl ?? null;

  return (
    <div className="flex flex-col gap-8">
      {/* A real `<label for>` pointing at a real `<input id>`, never a wrapping label — the same
          contract `ui/field.tsx` states and `kb-upload-flow.tsx` follows for its own file input. */}
      <label htmlFor={inputId} className="text-field-label font-bold text-text-primary">
        {label}
      </label>
      <p id={hintId} className="text-meta text-text-secondary">
        PNG, JPEG or WEBP, up to 5&nbsp;MB.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={[
          "flex flex-col items-center gap-16 rounded-control border-2 border-dashed p-16 sm:flex-row sm:items-center",
          dragActive
            ? "border-border-focus bg-surface-plum-tint"
            : "border-hairline-lilac bg-surface-warm-gray",
        ].join(" ")}
      >
        <div className="flex size-80 shrink-0 items-center justify-center overflow-hidden rounded-control border border-hairline-lilac bg-surface-card">
          {previewSrc !== null && !imageFailed ? (
            // A remote, per-org URL with no fixed hostname to allowlist — see the module
            // docstring for why this is a plain <img> rather than next/image.
            // eslint-disable-next-line @next/next/no-img-element -- remote per-org logo, no static domain to allowlist
            <img
              src={previewSrc}
              alt=""
              onError={() => setImageFailed(true)}
              className="size-full object-contain"
            />
          ) : (
            <span className="px-4 text-center text-meta text-text-tertiary">No logo</span>
          )}
        </div>

        <div className="flex flex-1 flex-col items-start gap-8">
          <input
            id={inputId}
            type="file"
            accept={ACCEPT_ATTR}
            aria-describedby={hintId}
            disabled={busy}
            onChange={handleFileChange}
            className="text-copy text-text-primary file:mr-12 file:min-h-40 file:rounded-control file:border-0 file:bg-action-primary file:px-16 file:text-label file:font-bold file:text-text-inverse"
          />
          <p className="text-meta text-text-tertiary">or drag an image file here</p>
        </div>
      </div>

      {validationError !== null ? (
        <p role="alert" className="text-copy text-text-primary">
          {validationError}
        </p>
      ) : null}

      {phase.kind === "uploading" ? (
        <div className="flex flex-col gap-4">
          <div
            role="progressbar"
            aria-label="Uploading logo"
            aria-valuenow={phase.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-8 w-full overflow-hidden rounded-pill bg-surface-warm-gray"
          >
            <div
              style={{ width: `${phase.percent}%` }}
              className="h-full rounded-pill bg-action-primary transition-[width] duration-[var(--duration-fast)] ease-standard"
            />
          </div>
          <p className="text-meta text-text-secondary">{phase.percent}%</p>
        </div>
      ) : null}

      {phase.kind === "confirming" ? (
        <p role="status" className="text-copy text-text-secondary">
          Finishing up…
        </p>
      ) : null}

      {phase.kind === "error" ? (
        <p role="alert" className="text-copy text-text-primary">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}

export default LogoUploadField;
