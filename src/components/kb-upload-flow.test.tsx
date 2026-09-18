/**
 * Tests for the real Knowledge Base upload flow (agents.md §10.5 tasks 1–2).
 *
 * `fetch` is mocked for the two JSON calls (`presign` and `confirm`); the raw `PUT` to the
 * presigned URL is exercised against a fake `XMLHttpRequest` so upload progress and failure
 * paths are real, not stubbed away — there is no backend or object store in a unit test, but the
 * three-call sequence and its request shapes are.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/api/client";

import { KbUploadFlow } from "./kb-upload-flow";

const nav = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: nav.push,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function envelope(code: string, message: string) {
  return { error: { code, message, details: {} } };
}

function pdfFile(name = "handbook.pdf", sizeBytes = 1024) {
  const file = new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" });
  return file;
}

/** A minimal, controllable stand-in for `XMLHttpRequest`, covering only what
 * `putFileWithProgress` actually uses. Each test drives it by calling `emitProgress` /
 * `complete` / `fail` on the instance the component just constructed. */
class FakeXhr {
  static instances: FakeXhr[] = [];

  status = 0;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readonly opened: { method: string; url: string }[] = [];
  readonly headers: Record<string, string> = {};
  sentBody: unknown = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.opened.push({ method, url });
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.sentBody = body;
  }

  emitProgress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }

  complete(status: number) {
    this.status = status;
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr as unknown as typeof XMLHttpRequest);
  nav.push.mockReset();
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillAndSubmit(file: File) {
  fireEvent.change(screen.getByLabelText("Document file"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
}

describe("kb upload — form", () => {
  it("labels the file field and only accepts the four supported file types", () => {
    render(<KbUploadFlow />);

    const fileInput = screen.getByLabelText("Document file");
    expect(fileInput.getAttribute("type")).toBe("file");
    expect(fileInput.getAttribute("accept")).toBe(".pdf,.docx,.txt,.md");
  });

  it("rejects an unsupported file type before any network call", () => {
    render(<KbUploadFlow />);

    fireEvent.change(screen.getByLabelText("Document file"), {
      target: { files: [new File(["x"], "handbook.xlsx", { type: "application/vnd.ms-excel" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("PDF, DOCX, TXT and MD");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a file over 25 MB before any network call", () => {
    render(<KbUploadFlow />);

    fireEvent.change(screen.getByLabelText("Document file"), {
      target: { files: [pdfFile("big.pdf", 26 * 1024 * 1024)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Files must be under 25 MB");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a file to be chosen before uploading", () => {
    render(<KbUploadFlow />);

    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    expect(screen.getByRole("alert").textContent).toContain("Choose a file to upload");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("kb upload — the real three-call sequence", () => {
  it("presigns, PUTs the raw bytes directly (never through the API), confirms, then redirects", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        document_id: "doc-1",
        upload_url: "http://minio.local/kayla-kb-dev/org/org-1/kb/doc-1/handbook.pdf?sig=abc",
      }),
    );

    render(<KbUploadFlow />);
    await fillAndSubmit(pdfFile());

    await waitFor(() => {
      expect(FakeXhr.instances).toHaveLength(1);
    });
    const xhr = FakeXhr.instances[0]!;
    expect(xhr.opened[0]).toEqual({
      method: "PUT",
      url: "http://minio.local/kayla-kb-dev/org/org-1/kb/doc-1/handbook.pdf?sig=abc",
    });
    expect(xhr.headers["Content-Type"]).toBe("application/pdf");

    xhr.emitProgress(512, 1024);
    await waitFor(() => {
      expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    });
    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toContain("handbook.pdf");

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { document_id: "doc-1", status: "uploaded", status_display: "Queued" }),
    );
    xhr.complete(200);

    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/knowledge-base");
    });

    // Exactly the two JSON calls went through `fetch` — the PUT never did.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [presignUrl, presignInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(presignUrl).toBe("http://localhost:8000/kb/documents/presign");
    expect(JSON.parse(String(presignInit.body))).toEqual({
      filename: "handbook.pdf",
      content_type: "application/pdf",
      size: 1024,
    });

    const [confirmUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(confirmUrl).toBe("http://localhost:8000/kb/documents/doc-1/confirm");
  });

  it("surfaces a presign failure as an alert without touching the object store", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, envelope("document_limit_reached", "This org already has 200 documents.")),
    );

    render(<KbUploadFlow />);
    await fillAndSubmit(pdfFile());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This org already has 200 documents.");
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("surfaces a failed PUT to storage as an alert", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { document_id: "doc-1", upload_url: "http://minio.local/upload" }),
    );

    render(<KbUploadFlow />);
    await fillAndSubmit(pdfFile());

    await waitFor(() => {
      expect(FakeXhr.instances).toHaveLength(1);
    });
    FakeXhr.instances[0]!.complete(500);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not upload this document");
    expect(nav.push).not.toHaveBeenCalled();
  });
});
