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

import { useEffect, useRef, useState } from "react";

import { ApiError, CLIENT_ERROR_CODES, getSession } from "@/api/client";
import { env } from "@/env";
import { KbDocumentCard, isKbDocumentTerminal } from "@/components/kb-document-card";
import type { KbDocument } from "@/components/kb-document-card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";

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
      <PageHeader
        eyebrow="Knowledge Base"
        title="Knowledge Base"
        description="Upload your employee handbook and policy documents so Kayla can answer questions from them, with a citation back to the exact section every time."
        actions={<LinkButton href="/knowledge-base/upload">Upload document</LinkButton>}
      />

      {state.status === "loading" ? <PageSkeleton label="Loading documents…" /> : null}

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
        <EmptyState
          icon={<DocumentGlyph />}
          title="No documents yet"
          description="Kayla answers a new hire’s policy questions only from what you upload here — never from the open internet, and never without citing the section it drew from."
          action={<LinkButton href="/knowledge-base/upload">Upload your handbook</LinkButton>}
        />
      ) : null}

      {state.status === "loaded" && state.documents.length > 0 ? (
        <ul className="flex list-none flex-col gap-16 p-[0]">
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

/** Lucide `file-text` — the same glyph the rail uses for this section. */
function DocumentGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </svg>
  );
}
