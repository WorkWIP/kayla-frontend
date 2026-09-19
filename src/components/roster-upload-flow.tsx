"use client";

/**
 * The real 3-step roster CSV upload flow (agents.md §10.3 tasks 3–5, `kb/MVP-SPEC.md` §2.1.1 /
 * §3.4).
 *
 * Ported from the INTERACTION DESIGN of `kb/kaylahealth-demo/components/dashboard/
 * RosterUploadFlow.tsx` — file picker → column-mapping preview → confirm — but that component's
 * own docstring says it "never parses the file" and its mapping/preview/import all come from
 * fixed sample data (`lib/mock/rosterPreview.ts`). Every network call and every row shown below
 * is real: `POST /rosters/preview` actually parses the uploaded bytes, and nothing is written
 * until `POST /rosters/confirm` is called from the third step.
 *
 * --------------------------------------------------------------------------------------------
 * The three steps, and why step 3 is a real pause (decision 3 / `Q-43`)
 * --------------------------------------------------------------------------------------------
 * 1. `select`  — choose a `.csv`. Selecting a file immediately previews it (there is nothing to
 *    decide before parsing; the file itself is the only input this step takes).
 * 2. `review`  — the real column mapping and the real per-row diagnosis `POST /rosters/preview`
 *    returned: `new` / `updated` / `unchanged` / `invalid`. If any row is `invalid`, the
 *    "Continue" control is disabled and stays disabled — this flow does not let a validation
 *    problem pass silently, and there is no path from here to `confirm` while one exists.
 * 3. `confirm` — the counts this upload *would* produce, and one explicit button that is the
 *    only thing in this component that calls `POST /rosters/confirm`. "Ask before proceeding"
 *    (decision 3) means this is a real second click, not a formality the flow advances through
 *    on its own — nothing above this step has written anything to the roster yet.
 *
 * `result` is not a fourth step; it is what `confirm` shows once the click above has actually
 * committed the upload.
 *
 * --------------------------------------------------------------------------------------------
 * Why the preview call does not go through `apiRequest` (`src/api/client.ts`)
 * --------------------------------------------------------------------------------------------
 * `POST /rosters/preview` takes `multipart/form-data`; `apiRequest` always serialises `body` with
 * `JSON.stringify` and always sends `Content-Type: application/json` when a body is present
 * (agents.md's own file ownership for this phase excludes `client.ts`). Forcing a `FormData`
 * body through that path would either fail to compile (the generated request-body type for this
 * operation is not JSON, so `apiRequest`'s types reject a body at all) or, worse, would compile
 * and then silently send the file as a broken JSON string. This file makes that one request
 * directly instead, reusing the same session store, contract types and `ApiError` shape
 * `apiRequest` uses everywhere else. `POST /rosters/confirm` takes a plain JSON body with no path
 * parameter, so it goes through `apiRequest` exactly like any other dashboard mutation.
 *
 * --------------------------------------------------------------------------------------------
 * Accessibility (agents.md §5.6 — the pattern `login-form.tsx` already established)
 * --------------------------------------------------------------------------------------------
 * Every error region is `role="alert"`. The file input has a real `<label>` and a described hint.
 * A row the API flagged `invalid` carries `aria-invalid="true"` and `aria-describedby` pointing at
 * its own problem text, exactly as a form field does on the login screen. The rows table is a
 * real `<table>` with `<th scope="col">`, never a div grid.
 */

import { useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { ApiError, CLIENT_ERROR_CODES, apiRequest, getSession } from "@/api/client";
import type { components } from "@/api/generated";
import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Table, TableCell, TableRow } from "@/components/ui/table";
import { env } from "@/env";

type RosterPreviewResponse = components["schemas"]["RosterPreviewResponse"];
type RosterRowPreview = components["schemas"]["RosterRowPreview"];
type RosterConfirmResponse = components["schemas"]["RosterConfirmResponse"];
type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];
type Diagnosis = RosterRowPreview["diagnosis"];

const API_ROOT = env.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
/** Parsing a real file can take longer than a plain JSON round trip. */
const PREVIEW_TIMEOUT_MS = 30_000;

const GENERIC_UPLOAD_FAILURE =
  "Could not read this file as a roster CSV. Check the columns and try again.";

/** Known `RosterRowPreview.problems` codes, per the contract's own examples. Anything else falls
 * back to a humanised version of the code rather than hiding it — a code this UI does not
 * recognise yet is still a real reason a row cannot be uploaded. */
const PROBLEM_COPY: Readonly<Record<string, string>> = {
  missing_email: "Missing email address",
  missing_first_name: "Missing first name",
  missing_last_name: "Missing last name",
  invalid_email: "Email address could not be read",
  invalid_start_date: "Start date could not be read",
  duplicate_email_in_file: "This email address appears more than once in this file",
};

function describeProblem(code: string): string {
  return PROBLEM_COPY[code] ?? code.replaceAll("_", " ");
}

const DIAGNOSIS_COPY: Readonly<Record<Diagnosis, string>> = {
  new: "New",
  updated: "Updated",
  unchanged: "Unchanged",
  invalid: "Needs fixing",
};

/** Colour is never the only signal here (agents.md §5.5) — every badge carries the word above
 * as well as the tint. */
/** Which diagnosis deserves which pill. Domain knowledge, so it stays here, not in `Badge`. */
const DIAGNOSIS_TONE: Readonly<Record<Diagnosis, BadgeTone>> = {
  new: "positive",
  updated: "attention",
  unchanged: "neutral",
  invalid: "critical",
};

function DiagnosisBadge({ diagnosis }: { readonly diagnosis: Diagnosis }) {
  return <Badge tone={DIAGNOSIS_TONE[diagnosis]}>{DIAGNOSIS_COPY[diagnosis]}</Badge>;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}

/** The one hand-written request in this file — see the module docstring for why `apiRequest`
 * cannot carry a multipart body. Mirrors its error handling exactly. */
async function previewRoster(file: File): Promise<RosterPreviewResponse> {
  const session = getSession();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (session !== null) {
    headers.Authorization = `Bearer ${session.tokens.access_token}`;
  }
  // No Content-Type is set here on purpose: the browser derives one from the `FormData` body,
  // including the multipart boundary. Setting it by hand would drop that boundary and the
  // server would fail to parse the body at all.

  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/rosters/preview`, {
      method: "POST",
      headers,
      body,
      credentials: "omit",
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
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
    return (await response.json()) as RosterPreviewResponse;
  } catch {
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.responseNotUnderstood,
      message: "The server responded with a body this client does not understand.",
    });
  }
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

const MAPPING_COLUMNS = ["Roster field", "Column in your file"] as const;
const ROW_COLUMNS = ["Row", "Name", "Email", "Status"] as const;

type Step = "select" | "review" | "confirm" | "result";

interface PreviewData extends RosterPreviewResponse {
  readonly fileName: string;
}

export interface RosterUploadFlowProps {
  /** Called once an upload actually commits. Optional — the flow's own result step already
   * offers a way back to the cohorts list without one. */
  readonly onConfirmed?: (result: RosterConfirmResponse) => void;
}

export function RosterUploadFlow({ onConfirmed }: RosterUploadFlowProps = {}) {
  const flowId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<RosterConfirmResponse | null>(null);

  const [reading, setReading] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const fileInputId = `${flowId}-file`;
  const fileHintId = `${flowId}-file-hint`;

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Always clear the raw input value: without this, choosing the same filename twice in a row
    // (e.g. after fixing the CSV in place) would not fire a second `change` event at all.
    event.target.value = "";
    if (!file) return;

    setSelectError(null);
    setReading(true);
    try {
      const response = await previewRoster(file);
      setPreview({ ...response, fileName: file.name });
      setConfirmError(null);
      setResult(null);
      setStep("review");
    } catch (error) {
      setSelectError(messageFor(error, GENERIC_UPLOAD_FAILURE));
    } finally {
      setReading(false);
    }
  }

  function handleChooseDifferentFile() {
    setPreview(null);
    setSelectError(null);
    setConfirmError(null);
    setStep("select");
  }

  async function handleConfirm() {
    if (preview === null || confirming) return;
    setConfirmError(null);
    setConfirming(true);
    try {
      const response = await apiRequest("post", "/rosters/confirm", {
        body: { preview_token: preview.preview_token },
      });
      setResult(response);
      onConfirmed?.(response);
      setStep("result");
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setConfirmError(
          "This upload has expired or was already confirmed. Choose the file again.",
        );
      } else {
        setConfirmError(messageFor(error, "Could not confirm this upload."));
      }
    } finally {
      setConfirming(false);
    }
  }

  const mappingRows: ReadonlyArray<{
    readonly field: string;
    readonly header: string | null | undefined;
  }> = preview
      ? [
          { field: "Last name", header: preview.column_mapping.last_name },
          { field: "First name", header: preview.column_mapping.first_name },
          { field: "Email", header: preview.column_mapping.email },
          { field: "Start date", header: preview.column_mapping.start_date },
          { field: "Site", header: preview.column_mapping.site },
          { field: "Role", header: preview.column_mapping.role_title },
        ]
      : [];

  return (
    <div className="flex flex-col gap-24 rounded-card-lg bg-surface-card p-32 shadow-elevation-card">
      {step === "select" ? (
        <div className="flex flex-col gap-16">
          <div className="flex flex-col gap-8">
            <label htmlFor={fileInputId} className="text-field-label font-bold text-text-primary">
              Roster CSV
            </label>
            <p id={fileHintId} className="text-copy text-text-secondary">
              Comma- or semicolon-separated. Must include Last Name, First Name and email columns.
              Start date, site and role are optional — a worker can join without them.
            </p>
          </div>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".csv"
            aria-describedby={fileHintId}
            disabled={reading}
            onChange={(event) => {
              void handleFileSelected(event);
            }}
            className="text-copy text-text-primary file:mr-16 file:min-h-48 file:rounded-control file:border-0 file:bg-action-primary file:px-24 file:text-label file:font-bold file:text-text-inverse"
          />
          {reading ? (
            <p role="status" className="text-body text-text-secondary">
              Reading the file…
            </p>
          ) : null}
          {selectError !== null ? (
            <div
              role="alert"
              className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
            >
              <p className="text-label font-bold text-text-primary">Could not read this file.</p>
              <p className="text-copy text-text-primary">{selectError}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "review" && preview !== null ? (
        <div className="flex flex-col gap-24">
          <div className="flex flex-col gap-4">
            <p className="text-label font-bold text-text-primary">{preview.fileName}</p>
            <p className="text-body text-text-secondary">
              {preview.summary.total_rows} rows read — {preview.summary.new_count} new,{" "}
              {preview.summary.updated_count} updated, {preview.summary.unchanged_count} unchanged
              {preview.summary.invalid_count > 0
                ? `, ${preview.summary.invalid_count} with a problem`
                : ""}
              .
            </p>
          </div>

          {preview.summary.invalid_count > 0 ? (
            <div
              role="alert"
              className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
            >
              <p className="text-label font-bold text-text-primary">
                {preview.summary.invalid_count === 1
                  ? "1 row has a problem"
                  : `${preview.summary.invalid_count} rows have a problem`}{" "}
                and must be fixed before this roster can be uploaded.
              </p>
              <p className="text-copy text-text-primary">
                Nothing has been saved yet. Fix the file and choose it again.
              </p>
            </div>
          ) : null}

          <section className="flex flex-col gap-8">
            <h2 className="text-title text-text-primary">Column mapping</h2>
            <Table
              caption={`Which column in ${preview.fileName} was read as each roster field`}
              headers={MAPPING_COLUMNS}
            >
              {mappingRows.map((row) => (
                <TableRow key={row.field}>
                  <TableCell tone="primary" className="font-medium">
                    {row.field}
                  </TableCell>
                  <TableCell>{row.header ?? "Not in this file"}</TableCell>
                </TableRow>
              ))}
            </Table>
          </section>

          <section className="flex flex-col gap-8">
            <h2 className="text-title text-text-primary">Rows in this file</h2>
            <Table
              caption={`Every row in ${preview.fileName} and what would happen to it`}
              headers={ROW_COLUMNS}
            >
              {preview.rows.map((row) => {
                const isInvalid = row.diagnosis === "invalid";
                const problemsId = `${flowId}-row-${row.row_number}-problems`;
                return (
                  <TableRow
                    key={row.row_number}
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? problemsId : undefined}
                  >
                    <TableCell>{row.row_number}</TableCell>
                    <TableCell tone="primary">
                      {row.last_name || row.first_name
                        ? `${row.last_name}, ${row.first_name}`.replace(/^, /, "").replace(/, $/, "")
                        : "—"}
                    </TableCell>
                    <TableCell>{row.email || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-4">
                        <DiagnosisBadge diagnosis={row.diagnosis} />
                        {isInvalid ? (
                          <p id={problemsId} className="text-copy text-status-critical">
                            {(row.problems ?? []).map(describeProblem).join("; ")}
                          </p>
                        ) : null}
                        {row.diagnosis === "updated" && (row.changes ?? []).length > 0 ? (
                          <p className="text-meta text-text-secondary">
                            Changes: {(row.changes ?? []).map((change) => change.field).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          </section>

          <div className="flex flex-wrap gap-12">
            <Button variant="secondary" onClick={handleChooseDifferentFile}>
              Choose a different file
            </Button>
            <Button
              onClick={() => setStep("confirm")}
              disabled={preview.summary.invalid_count > 0}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "confirm" && preview !== null ? (
        <div className="flex flex-col gap-24">
          <div className="flex flex-col gap-8">
            <h2 className="text-title text-text-primary">Confirm this upload</h2>
            <p className="text-body text-text-secondary">
              This will update the roster from {preview.fileName}, {preview.summary.total_rows}{" "}
              rows in total:
            </p>
            <ul className="flex flex-col gap-4 text-body text-text-primary">
              <li>
                {preview.summary.new_count}{" "}
                {preview.summary.new_count === 1 ? "new roster entry" : "new roster entries"}
              </li>
              <li>
                {preview.summary.updated_count}{" "}
                {preview.summary.updated_count === 1 ? "entry" : "entries"} updated
              </li>
              <li>{preview.summary.unchanged_count} unchanged</li>
            </ul>
            <p className="text-copy text-text-secondary">
              A worker already on the roster but missing from this file is never removed.
            </p>
          </div>

          {confirmError !== null ? (
            <div
              role="alert"
              className="flex flex-col gap-4 rounded-card border border-status-critical bg-status-critical-subtle p-16"
            >
              <p className="text-label font-bold text-text-primary">Could not confirm this upload.</p>
              <p className="text-copy text-text-primary">{confirmError}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-12">
            <Button variant="secondary" onClick={() => setStep("review")} disabled={confirming}>
              Back
            </Button>
            <Button
              onClick={() => {
                void handleConfirm();
              }}
              loading={confirming}
              loadingLabel="Uploading…"
            >
              Confirm upload
            </Button>
          </div>
        </div>
      ) : null}

      {step === "result" && result !== null ? (
        <div className="flex flex-col gap-16">
          <h2 className="text-title text-text-primary">Roster updated</h2>
          <ul className="flex flex-col gap-4 text-body text-text-primary">
            <li>{result.new_count} new</li>
            <li>{result.updated_count} updated</li>
            <li>{result.unchanged_count} unchanged</li>
            <li>{result.total_rows} total rows</li>
          </ul>
          <LinkButton href="/cohorts">View cohorts</LinkButton>
        </div>
      ) : null}
    </div>
  );
}

export default RosterUploadFlow;
