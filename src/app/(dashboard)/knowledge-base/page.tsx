"use client";

/**
 * `/knowledge-base` — the HR admin's Knowledge Base document list (agents.md §10.5 task 13,
 * `kb/notes/RAG.md` §7–8).
 *
 * Reads `GET /kb/documents` and renders one `KbDocumentCard` per row, each showing Q-51's exact
 * status copy. A freshly uploaded document lands here as `uploaded` ("Queued") and moves through
 * `parsing` / `chunking` / `embedding` ("Processing") to a terminal state — `indexed`, one of the
 * `failed_*` states, `quarantined_injection`, or `superseded` — entirely on worker-ingest's own
 * schedule, with nothing on this page driving it.
 *
 * This page polls `GET /kb/documents` on a fixed interval (`POLL_INTERVAL_MS`) so a transition
 * shows up without a manual refresh, and stops polling once every visible document has reached a
 * terminal status (`isKbDocumentTerminal`, `kb-document-card.tsx`) — there is nothing left that
 * could still change. Navigating back here (e.g. after an upload) always does one immediate
 * fetch regardless of that state.
 *
 * Deliberately reads the plain list endpoint rather than `GET /kb/documents/{id}` per document —
 * one request refreshes every row's status in a single round trip, and this screen never needs a
 * single document in isolation. There is no per-document detail route in this phase (agents.md
 * §10.5's file list for this phase names this file and `knowledge-base/upload/page.tsx` only).
 *
 * A client component for the same reason `/cohorts` is one: the session lives only in
 * `src/api/client.ts`'s in-memory store, so there is nothing a server render could fetch with,
 * and `DashboardShell` (this route's layout) has already confirmed a session before this page
 * mounts.
 *
 * `GET /kb/documents` is not yet in `src/api/generated.ts` — see `kb-upload-flow.tsx`'s module
 * docstring for why (`kayla-backend/openapi.json` has not been regenerated against
 * `kayla.kb.router` yet, and doing so is outside this task's file ownership) and for the same
 * hand-rolled-request pattern this file follows. The response shape (`{ documents: [...] }`) is
 * copied from `kayla.kb.schemas.KbDocumentListResponse`, read directly.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, getSession } from "@/api/client";
import { env } from "@/env";
import { KbDocumentCard, isKbDocumentTerminal } from "@/components/kb-document-card";
import type { KbDocument } from "@/components/kb-document-card";

const API_ROOT = env.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");

/** How often this page re-polls while any row is still in flight. Fast enough that an HR admin
 * watching a small handbook process sees it move within a few refreshes; slow enough not to
 * hammer the API for a pipeline whose slowest step (the Document Intelligence OCR fallback) runs
 * on the order of seconds to low minutes, not sub-second. */
const POLL_INTERVAL_MS = 5_000;

const GENERIC_FAILURE = "Could not load the knowledge base. Try again in a moment.";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.code === CLIENT_ERROR_CODES.networkUnreachable ||
      error.code === CLIENT_ERROR_CODES.responseNotUnderstood
    ) {
      return "Kayla is not reachable right now. Try again in a moment.";
    }
    return error.message || GENERIC_FAILURE;
  }
  return GENERIC_FAILURE;
}

function isErrorEnvelope(
  value: unknown,
): value is { error: { code: string; message: string; details?: Record<string, unknown> } } {
  if (typeof value !== "object" || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}

async function fetchKbDocuments(): Promise<readonly KbDocument[]> {
  const session = getSession();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (session !== null) {
    headers.Authorization = `Bearer ${session.tokens.access_token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/kb/documents`, {
      method: "GET",
      headers,
      credentials: "omit",
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
    const body = (await response.json()) as { documents: KbDocument[] };
    return body.documents;
  } catch {
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.responseNotUnderstood,
      message: "The server responded with a body this client does not understand.",
    });
  }
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly documents: readonly KbDocument[] };

export default function KnowledgeBasePage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const documents = await fetchKbDocuments();
        if (cancelled) return;
        setState({ status: "loaded", documents });
        if (!documents.every((document) => isKbDocumentTerminal(document.status))) {
          timerRef.current = setTimeout(() => {
            void poll();
          }, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: messageFor(error) });
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-24 p-32">
      <div className="flex flex-wrap items-start justify-between gap-16">
        <div className="flex flex-col gap-8">
          <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
            Knowledge Base
          </p>
          <h1 className="text-display-2 text-text-primary">Knowledge Base</h1>
          <p className="max-w-md text-body text-text-secondary">
            Upload your employee handbook and policy documents so Kayla can answer questions from
            them, with a citation back to the exact section every time.
          </p>
        </div>
        <Link
          href="/knowledge-base/upload"
          className="flex min-h-48 shrink-0 items-center rounded-control bg-action-primary px-24 text-label font-bold text-text-inverse transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-action-primary-hover focus-visible:outline-hidden focus-visible:inset-shadow-focus-mint"
        >
          Upload document
        </Link>
      </div>

      {state.status === "loading" ? (
        <p role="status" className="text-body text-text-secondary">
          Loading documents…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
        >
          <p className="text-label font-bold text-text-primary">
            Could not load the knowledge base.
          </p>
          <p className="text-copy text-text-primary">{state.message}</p>
        </div>
      ) : null}

      {state.status === "loaded" && state.documents.length === 0 ? (
        <p className="text-body text-text-secondary">
          No documents yet. Upload a handbook or policy document to get started.
        </p>
      ) : null}

      {state.status === "loaded" && state.documents.length > 0 ? (
        <ul className="flex list-none flex-col gap-16 p-0">
          {state.documents.map((document) => (
            <li key={document.id}>
              <KbDocumentCard document={document} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
