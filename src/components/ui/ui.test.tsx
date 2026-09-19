/**
 * The shared UI primitives.
 *
 * Two kinds of assertion live here and they are worth telling apart:
 *
 *  - *Behaviour*: what a control does when it is used — the things a page test would otherwise
 *    have to re-assert once per call site.
 *  - *Skin*: that the extracted class strings still contain the declarations the seven call
 *    sites they replaced were relying on. A visual regression in a primitive is a visual
 *    regression in a dozen screens at once, and `jsdom` ships no CSS, so the class list is the
 *    only thing there is to hold on to. These are deliberately narrow — they pin the handful of
 *    utilities that other tests and the design system actually depend on (`min-h-48` for the
 *    44-pixel target rule, `rounded-pill px-12 py-4 text-meta font-bold` for the badge spine,
 *    the card surface), not the whole string.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Badge } from "./badge";
import { Button, LinkButton, buttonSkin } from "./button";
import { CARD_SURFACE, Card } from "./card";
import { EmptyState } from "./empty-state";
import { NumberField, TextField } from "./field";
import { Modal } from "./modal";
import { PageHeader } from "./page-header";
import { PageSkeleton, Skeleton } from "./skeleton";
import { Table, TableCell, TableEmptyRow, TableRow } from "./table";

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  it("keeps the treatment the two duplicated PRIMARY_BUTTON constants carried", () => {
    const skin = buttonSkin().split(/\s+/);
    // The subset other tests and agents.md §5.6 actually depend on.
    for (const utility of [
      "min-h-48",
      "px-24",
      "rounded-control",
      "bg-action-primary",
      "text-text-inverse",
      "hover:bg-action-primary-hover",
      "disabled:bg-action-disabled",
    ]) {
      expect(skin).toContain(utility);
    }
  });

  it("gives each variant its own fill and each size its own target", () => {
    expect(buttonSkin({ variant: "secondary" })).toContain("bg-surface-card");
    expect(buttonSkin({ variant: "ghost" })).toContain("bg-transparent");
    expect(buttonSkin({ variant: "destructive" })).toContain("bg-status-critical");
    expect(buttonSkin({ size: "sm" }).split(/\s+/)).toContain("min-h-40");
    expect(buttonSkin({ fullWidth: true }).split(/\s+/)).toContain("w-full");
    expect(buttonSkin().split(/\s+/)).toContain("w-fit");
  });

  it("defaults to type=button, so a button inside a form does not submit it by accident", () => {
    render(<Button>Do the thing</Button>);
    expect(screen.getByRole("button", { name: "Do the thing" }).getAttribute("type")).toBe("button");
  });

  it("disables itself and announces while loading, and takes the loading label as its name", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button loading={false} loadingLabel="Saving…" onClick={onClick}>
        Save changes
      </Button>,
    );
    const idle = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(idle.disabled).toBe(false);
    expect(idle.getAttribute("aria-busy")).toBeNull();

    rerender(
      <Button loading loadingLabel="Saving…" onClick={onClick}>
        Save changes
      </Button>,
    );
    const busy = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");

    fireEvent.click(busy);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("reserves the spinner's slot only for a button that can load, so nothing else shifts", () => {
    const { container, rerender } = render(<Button>Plain</Button>);
    expect(container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(0);

    rerender(<Button loading={false}>Can load</Button>);
    expect(container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(1);
  });

  it("keeps the children as the name while loading when no loading label is given", () => {
    render(<Button loading>Continue</Button>);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });

  it("LinkButton is a real anchor wearing the same skin", () => {
    render(<LinkButton href="/cohorts">Upload roster</LinkButton>);
    const link = screen.getByRole("link", { name: "Upload roster" });
    expect(link.getAttribute("href")).toBe("/cohorts");
    expect(link.className.split(/\s+/)).toContain("min-h-48");
  });
});

describe("TextField / NumberField", () => {
  it("binds the label to the input with for/id, never by wrapping", () => {
    const { container } = render(
      <TextField label="Work email" value="" onValueChange={() => {}} type="email" />,
    );
    const input = screen.getByLabelText("Work email");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("email");

    const label = container.querySelector("label");
    expect(label?.getAttribute("for")).toBeTruthy();
    expect(label?.querySelector("input")).toBeNull();
  });

  it("is always explicitly valid or invalid, and describes nothing when there is nothing to say", () => {
    const { rerender } = render(<TextField label="Work email" value="" onValueChange={() => {}} />);
    const clean = screen.getByLabelText("Work email");
    expect(clean.getAttribute("aria-invalid")).toBe("false");
    expect(clean.getAttribute("aria-describedby")).toBeNull();

    rerender(
      <TextField
        label="Work email"
        value=""
        onValueChange={() => {}}
        error="Enter your work email address."
      />,
    );
    const invalid = screen.getByLabelText("Work email");
    expect(invalid.getAttribute("aria-invalid")).toBe("true");

    // One element, whose whole text is the message — this is how login's own test reads it back.
    const describedBy = invalid.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Enter your work email address.",
    );
  });

  it("points at both the hint and the error when both are present", () => {
    render(
      <TextField
        label="Org"
        value=""
        onValueChange={() => {}}
        hint="Paste the whole link."
        error="No id in there."
      />,
    );
    const ids = (screen.getByLabelText("Org").getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Paste the whole link.",
      "No id in there.",
    ]);
  });

  it("reports the raw string, so an empty field stays empty instead of collapsing to a number", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <NumberField label="Min-N" value="4" onValueChange={onValueChange} min={1} max={1000} />,
    );
    const input = screen.getByLabelText("Min-N");
    expect(input.getAttribute("type")).toBe("number");
    expect(input.getAttribute("min")).toBe("1");
    expect(input.getAttribute("max")).toBe("1000");

    fireEvent.change(input, { target: { value: "12" } });
    expect(onValueChange).toHaveBeenLastCalledWith("12");

    // Clearing the field reports "", not 0 and not NaN — the caller decides what an empty field
    // means (Settings treats it as "not a valid value yet" and keeps Save disabled), which is
    // the whole reason this prop is a string.
    rerender(<NumberField label="Min-N" value="12" onValueChange={onValueChange} min={1} max={1000} />);
    fireEvent.change(screen.getByLabelText("Min-N"), { target: { value: "" } });
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("keeps both controls at the 44-pixel minimum target of agents.md §5.6", () => {
    render(
      <>
        <TextField label="A" value="" onValueChange={() => {}} />
        <NumberField label="B" value="" onValueChange={() => {}} />
      </>,
    );
    for (const name of ["A", "B"]) {
      expect(screen.getByLabelText(name).className.split(/\s+/)).toContain("min-h-48");
    }
  });
});

describe("Card", () => {
  it("carries the one surface treatment, on whichever element the caller needs", () => {
    const { container } = render(
      <Card as="li" className="gap-12">
        contents
      </Card>,
    );
    const card = container.firstElementChild;
    expect(card?.tagName).toBe("LI");
    for (const utility of CARD_SURFACE.split(/\s+/)) {
      expect(card?.className.split(/\s+/)).toContain(utility);
    }
    expect(card?.className.split(/\s+/)).toContain("gap-12");
  });
});

describe("PageHeader", () => {
  it("produces exactly one h1, plus the eyebrow, description and actions slot", () => {
    render(
      <PageHeader
        eyebrow="Cohorts"
        title="Upload roster"
        description="A second upload updates the existing roster."
        actions={<LinkButton href="/cohorts/upload">Upload roster</LinkButton>}
        backLink={{ href: "/cohorts", label: "← Back to cohorts" }}
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Upload roster");

    expect(screen.getByText("Cohorts")).toBeDefined();
    expect(screen.getByText("A second upload updates the existing roster.")).toBeDefined();
    expect(screen.getByRole("link", { name: "← Back to cohorts" }).getAttribute("href")).toBe(
      "/cohorts",
    );
    expect(screen.getByRole("link", { name: "Upload roster" }).getAttribute("href")).toBe(
      "/cohorts/upload",
    );
  });

  it("renders no description or actions node at all when it is given none", () => {
    const { container } = render(<PageHeader eyebrow="Settings" title="Settings" />);
    expect(container.querySelectorAll("p")).toHaveLength(1); // the eyebrow, and nothing else
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("Badge", () => {
  it("keeps the spine all five hand-rolled badges shared", () => {
    const { container } = render(<Badge tone="positive">Indexed</Badge>);
    const badge = container.firstElementChild;
    for (const utility of ["rounded-pill", "px-12", "py-4", "text-meta", "font-bold"]) {
      expect(badge?.className.split(/\s+/)).toContain(utility);
    }
    expect(badge?.className).toContain("bg-status-positive-subtle");
  });

  it("gives the outline variant a hairline and the lighter weight MilestoneChip used", () => {
    const { container } = render(<Badge variant="outline">Day 7</Badge>);
    const classes = container.firstElementChild?.className.split(/\s+/) ?? [];
    expect(classes).toContain("border");
    expect(classes).toContain("font-medium");
    expect(classes).not.toContain("font-bold");
  });
});

describe("EmptyState", () => {
  it("offers a heading, an explanation and somewhere to go — and is not an error", () => {
    render(
      <EmptyState
        icon={<svg aria-hidden="true" />}
        title="No cohorts yet"
        description="Upload a roster and Kayla forms the first one."
        action={<LinkButton href="/cohorts/upload">Upload your first roster</LinkButton>}
      />,
    );

    expect(screen.getByText("No cohorts yet")).toBeDefined();
    expect(screen.getByText("Upload a roster and Kayla forms the first one.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Upload your first roster" })).toBeDefined();

    // Having no data is not an error and must never be announced as one — two page tests
    // (check-in questions, engagement) assert exactly this from the outside.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Skeleton", () => {
  it("announces once, in words, and hides the blocks from the accessibility tree", () => {
    const { container } = render(<PageSkeleton label="Loading cohorts…" shape="grid" count={2} />);

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.textContent).toContain("Loading");

    const blocks = container.querySelectorAll("span[aria-hidden='true']");
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of Array.from(blocks)) {
      expect(block.textContent).toBe("");
    }
  });

  it("pulses only when motion is welcome", () => {
    const { container } = render(<Skeleton className="h-24" />);
    expect(container.firstElementChild?.className).toContain("motion-safe:animate-pulse");
  });
});

describe("Table", () => {
  it("cannot be rendered without a caption or without scoped column headers", () => {
    render(
      <Table caption="Roster entries in the September 2026 cohort" headers={["Last name", "Email"]}>
        <TableRow>
          <TableCell tone="primary">Rivera</TableCell>
          <TableCell>alex@example.com</TableCell>
        </TableRow>
      </Table>,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByText("Roster entries in the September 2026 cohort")).toBeDefined();

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((cell) => cell.textContent)).toEqual(["Last name", "Email"]);
    for (const header of headers) {
      expect(header.getAttribute("scope")).toBe("col");
    }
    expect(table.textContent).toContain("alex@example.com");
  });

  it("spans an empty message across every column rather than leaving a ragged row", () => {
    render(
      <Table caption="Nothing" headers={["A", "B", "C"]}>
        <TableEmptyRow colSpan={3}>No roster entries in this cohort.</TableEmptyRow>
      </Table>,
    );
    const cell = screen.getByText("No roster entries in this cohort.");
    expect(cell.getAttribute("colspan")).toBe("3");
  });
});

describe("Modal", () => {
  it("renders nothing at all while it is closed", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Dismiss this nudge?" />,
    );
    expect(container.firstElementChild).toBeNull();
  });

  it("is a dialog named by its own heading", () => {
    render(
      <Modal open onClose={() => {}} title="Dismiss this nudge?" description="Building A">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Dismiss this nudge?" });
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe(
      "Dismiss this nudge?",
    );
    expect(within(dialog).getByText("Building A")).toBeDefined();
  });

  it("closes from the ✕, from the backdrop and from Escape, through the one callback", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Dismiss this nudge?">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // A click that lands on the <dialog> element itself is a click outside the panel.
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);

    // Escape reaches a native <dialog> as `cancel`, not as a keydown the page can see.
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps Tab inside itself rather than letting focus fall through to the page behind", () => {
    render(
      <>
        <button type="button">outside, must never be reached</button>
        <Modal
          open
          onClose={() => {}}
          title="Dismiss this nudge?"
          footer={<button type="button">Dismiss nudge</button>}
        />
      </>,
    );
    const dialog = screen.getByRole("dialog");
    const last = screen.getByRole("button", { name: "Dismiss nudge" });
    const first = screen.getByRole("button", { name: "Close" });

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
