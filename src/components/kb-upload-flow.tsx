"use client";

/**
 * The real Knowledge Base upload flow (agents.md §10.5 tasks 1–2, `kb/notes/RAG.md` §7–8).
 *
 * --------------------------------------------------------------------------------------------
 * The three real network calls, in order
 * --------------------------------------------------------------------------------------------
 * 1. `POST /kb/documents/presign` — plain JSON: the file's name, its browser-reported content
 *    type, and its size in bytes. There is no `title` field — `kayla.kb.schemas`' own docstring
 *    says so explicitly: the backend derives `KbDocument.title` from the filename (extension
 *    stripped), because "an HR admin who wants a specific display title is not yet a feature
 *    this phase implements." Sending one anyway would be rejected outright: every request body
 *    in this API forbids unknown fields. The backend creates the `KbDocument` row (superseding
 *    the previous version of the same title in the same request, if one exists) and mints a
 *    presigned PUT URL scoped to `org/{org_id}/kb/{doc_id}/…` (agents.md §10.5 task 2) — it
 *    never sees the file's bytes.
 * 2. A raw `PUT` of the file straight to that URL — MinIO in dev/test, DigitalOcean Spaces in
 *    production, per `kayla.kb.storage`'s `StorageClient`. This is deliberately not routed
 *    through `kayla-backend` at all: "the droplet never proxies bytes" (task 2) is a real
 *    property of this code path, not just of the backend's. No `Authorization` header goes on
 *    this request — a presigned URL *is* the credential, and it is scoped to one document's
 *    prefix and nothing else (R3: per-tenant prefix isolation is structural, not a header this
 *    file could get wrong).
 * 3. `POST /kb/documents/{document_id}/confirm` — tells the backend the upload landed, which is
 *    what actually enqueues the ingest job (`kayla.kb.jobs`, `worker-ingest`). The document
 *    shows as `uploaded` ("Queued", Q-51) from this point on; every later transition —
 *    `parsing`/`chunking`/`embedding` ("Processing") through to `indexed` or a `failed_*`
 *    state — happens entirely on worker-ingest's own schedule and is `/knowledge-base`'s job to
 *    show, not this component's.
 *
 * On success this redirects straight to `/knowledge-base` (this task's own brief: "confirm ->
 * redirect to the document list"). That is a deliberate difference from `RosterUploadFlow`,
 * which stops at a result screen with a manual "View cohorts" link — the roster flow's own
 * design reasoning (`Q-43`, "ask before proceeding") is about the *destructive* `confirm` step
 * itself, which already got its own explicit button click here too; nothing in this flow calls
 * `confirm` without a real click. Once that click has succeeded there is nothing further to ask
 * before showing the list, and the freshly `Queued` row *is* the confirmation.
 *
 * --------------------------------------------------------------------------------------------
 * `POST /kb/documents/presign` and `.../confirm` are not in `src/api/generated.ts`
 * --------------------------------------------------------------------------------------------
 * The routes are real — `kayla.kb.router` (read directly, concurrently built alongside this
 * file) is wired into `kayla.main.create_app` — but `kayla-backend/openapi.json` had not been
 * regenerated against it as of this writing, and regenerating it is outside this task's file
 * ownership (it belongs to the backend side of this phase). `npm run codegen` reads that
 * committed file, not a live server, so it cannot yet produce `paths["/kb/documents"]`. The
 * request/response shapes below are copied field-for-field from `kayla.kb.schemas`
 * (`KbDocumentPresignRequest`/`Response`, `KbDocumentConfirmResponse`) rather than guessed;
 * `previewRoster` in `roster-upload-flow.tsx` already established the pattern of hand-rolling a
 * request outside `apiRequest` when the generated contract cannot type it, and this file follows
 * the same shape (same `ApiError`, same envelope handling). Replace these with generated, typed
 * calls — and delete this paragraph — the next time `openapi.json` is regenerated and
 * `npm run codegen` is run against it.
 *
 * --------------------------------------------------------------------------------------------
 * Client-side pre-flight checks are a courtesy, not the enforcement
 * --------------------------------------------------------------------------------------------
 * Extension and size are checked before any network call purely so a wrong file is rejected in
 * milliseconds instead of after a presign round trip. The real limits are enforced server-side
 * (task 3: "type, size, page count, encryption, text-layer presence") against the actual bytes,
 * and Q-51's own failure states (`failed_too_large`, `failed_unsupported_format`, …) are what a
 * document that slips past this pre-flight check — or is uploaded by some other client
 * entirely — ends up showing on `/knowledge-base`.
 *
 * --------------------------------------------------------------------------------------------
 * Why the PUT step uses `XMLHttpRequest` instead of `fetch`
 * --------------------------------------------------------------------------------------------
 * `fetch` reports *download* progress only; there is no standard way to observe upload progress
 * on it. `XMLHttpRequest.upload.onprogress` is the one real, accessible way to drive the progress
 * bar this flow's own requirements ask for ("a real progress indicator with an accessible name
 * during upload"), so the PUT — and only the PUT — goes through it.
 *
 * --------------------------------------------------------------------------------------------
 * Accessibility (agents.md §5.6 — the pattern `login-form.tsx` / `roster-upload-flow.tsx`
 * already established)
 * --------------------------------------------------------------------------------------------
 * The file input has a real `<label>`, and its hint text is wired via `aria-describedby`. Every
 * failure region is `role="alert"`. The progress bar is a real `role="progressbar"` with
 * `aria-valuenow`/`aria-valuemin`/`aria-valuemax` and an accessible name naming the file being
 * uploaded.
 */

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { ApiError, CLIENT_ERROR_CODES, getSession } from "@/api/client";
import { Button } from "@/components/ui/button";
import { env } from "@/env";

const API_ROOT = env.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");

/** agents.md §10.5 "Limits": PDF, DOCX, TXT, MD — 25 MB. */
const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(",");
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const PRESIGN_TIMEOUT_MS = 15_000;
const CONFIRM_TIMEOUT_MS = 15_000;

const GENERIC_UPLOAD_FAILURE = "Could not upload this document. Try again in a moment.";

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

/** One content type per accepted extension — this flow's own best-effort mapping; the backend
 * makes the real determination against the bytes (task 3). */
function contentTypeFor(filename: string): string {
  switch (extensionOf(filename)) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

interface ErrorEnvelopeLike {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelopeLike {
  if (typeof value !== "object" || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}

/** `kayla.kb.schemas.KbDocumentPresignRequest` — exactly these three fields, `extra="forbid"`. */
interface KbDocumentPresignRequest {
  readonly filename: string;
  readonly content_type: string;
  readonly size: number;
}

/** `kayla.kb.schemas.KbDocumentPresignResponse`. See this file's own module docstring for why
 * this cannot be typed off `src/api/generated.ts` yet. */
interface KbDocumentPresignResponse {
  readonly document_id: string;
  readonly upload_url: string;
  readonly expires_in_seconds: number;
}

/** `kayla.kb.schemas.KbDocumentConfirmResponse`. */
interface KbDocumentConfirmResponse {
  readonly document_id: string;
  readonly status: string;
  readonly status_display: string;
}

async function postJson<TResponse>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<TResponse> {
  const session = getSession();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (session !== null) {
    headers.Authorization = `Bearer ${session.tokens.access_token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.networkUnreachable,
      message: "Could not reach the Kayla API.",
      details: { cause: cause instanceof Error ? cause.name : "unknown" },
    });
  }

  if (!response.ok) {
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = undefined;
    }
    if (isErrorEnvelope(responseBody)) {
      throw new ApiError({
        status: response.status,
        code: responseBody.error.code,
        message: responseBody.error.message,
        details: responseBody.error.details,
      });
    }
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.responseNotUnderstood,
      message: `The server responded with ${response.status} and a body this client does not understand.`,
    });
  }

  try {
    return (await response.json()) as TResponse;
  } catch {
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.responseNotUnderstood,
      message: "The server responded with a body this client does not understand.",
    });
  }
}

/** The one request in this flow that never goes through `kayla-backend` — see the module
 * docstring. Resolves once the object store accepts the bytes; rejects with an `ApiError` on
 * any transport or non-2xx failure so the caller has exactly one failure shape to handle. */
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

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (
      error.code === CLIENT_ERROR_CODES.networkUnreachable ||
      error.code === CLIENT_ERROR_CODES.responseNotUnderstood
    ) {
      return "Kayla is not reachable right now. Try again in a moment.";
    }
    return error.message || fallback;
  }
  return fallback;
}

type Phase =
  | { readonly kind: "form" }
  | { readonly kind: "uploading"; readonly fileName: string; readonly percent: number }
  | { readonly kind: "confirming"; readonly fileName: string }
  | { readonly kind: "error"; readonly message: string };

export interface KbUploadFlowProps {
  /** Called once a document has actually been confirmed — before this component redirects.
   * Optional, purely for composition/testing; the redirect itself always happens. */
  readonly onConfirmed?: (documentId: string) => void;
}

export function KbUploadFlow({ onConfirmed }: KbUploadFlowProps = {}) {
  const router = useRouter();
  const flowId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  const fileInputId = `${flowId}-file`;
  const fileHintId = `${flowId}-file-hint`;

  const busy = phase.kind === "uploading" || phase.kind === "confirming";

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    if (phase.kind === "error") {
      setPhase({ kind: "form" });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (file === null) {
      setPhase({ kind: "error", message: "Choose a file to upload." });
      return;
    }
    const ext = extensionOf(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number])) {
      setPhase({
        kind: "error",
        message: "Kayla can only read PDF, DOCX, TXT and MD files here.",
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      // Matches Q-51's own `failed_too_large` copy exactly — this is the same limit, just
      // caught before a network round trip rather than after one.
      setPhase({ kind: "error", message: "Files must be under 25 MB" });
      return;
    }

    const contentType = contentTypeFor(file.name);

    try {
      setPhase({ kind: "uploading", fileName: file.name, percent: 0 });
      const presign = await postJson<KbDocumentPresignResponse>(
        "/kb/documents/presign",
        { filename: file.name, content_type: contentType, size: file.size } satisfies KbDocumentPresignRequest,
        PRESIGN_TIMEOUT_MS,
      );

      await putFileWithProgress(presign.upload_url, file, contentType, (percent) => {
        setPhase({ kind: "uploading", fileName: file.name, percent });
      });

      setPhase({ kind: "confirming", fileName: file.name });
      const confirmed = await postJson<KbDocumentConfirmResponse>(
        `/kb/documents/${presign.document_id}/confirm`,
        {},
        CONFIRM_TIMEOUT_MS,
      );

      onConfirmed?.(confirmed.document_id);
      router.push("/knowledge-base");
    } catch (error) {
      setPhase({ kind: "error", message: messageFor(error, GENERIC_UPLOAD_FAILURE) });
    }
  }

  return (
    <form
      noValidate
      aria-busy={busy}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-24 rounded-card-lg bg-surface-card p-32 shadow-elevation-card"
    >
      <div className="flex flex-col gap-8">
        <label htmlFor={fileInputId} className="text-field-label font-bold text-text-primary">
          Document file
        </label>
        <p id={fileHintId} className="text-copy text-text-secondary">
          PDF, DOCX, TXT or MD, up to 25 MB. Kayla names the document after the file name —
          uploading a file whose name (without its extension) matches an existing document adds a
          new version and replaces it; the old version is never deleted, just marked replaced.
        </p>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept={ACCEPT_ATTR}
          aria-describedby={fileHintId}
          disabled={busy}
          onChange={handleFileChange}
          className="text-copy text-text-primary file:mr-16 file:min-h-48 file:rounded-control file:border-0 file:bg-action-primary file:px-24 file:text-label file:font-bold file:text-text-inverse"
        />
      </div>

      {phase.kind === "uploading" ? (
        <div className="flex flex-col gap-8">
          <p className="text-label font-bold text-text-primary">
            Uploading {phase.fileName}…
          </p>
          <div
            role="progressbar"
            aria-label={`Uploading ${phase.fileName}`}
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
        <p role="status" className="text-body text-text-secondary">
          Finishing up…
        </p>
      ) : null}

      {phase.kind === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">Could not upload this document.</p>
          <p className="text-copy text-text-primary">{phase.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-12">
        <Button type="submit" loading={busy} loadingLabel="Uploading…">
          Upload document
        </Button>
      </div>
    </form>
  );
}

export default KbUploadFlow;
