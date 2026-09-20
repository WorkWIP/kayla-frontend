"use client";

/**
 * A segmented tab strip, for a screen whose content divides into named sets.
 *
 * --------------------------------------------------------------------------------------------
 * Why this exists
 * --------------------------------------------------------------------------------------------
 * Several screens answered "there are five kinds of thing here" by stacking five headed sections
 * down one column — `/actions` most of all, where five status sections of tall nudge cards meant
 * the thing you actually had to act on ("Needs review") was one screen among five. Tabs make the
 * set you want the only one you scroll.
 *
 * --------------------------------------------------------------------------------------------
 * Local state, never the URL
 * --------------------------------------------------------------------------------------------
 * `activeKey`/`onChange` are owned by the calling page as ordinary React state. That is not a
 * preference: `(dashboard)/__tests__/no-individual-care-usage.test.tsx` renders every dashboard
 * page against a `next/navigation` mock that provides `useParams` and `useRouter` and nothing
 * else, so a `useSearchParams` here would make every one of those pages throw on render. If a
 * tab ever needs to be linkable, that mock has to grow first.
 *
 * --------------------------------------------------------------------------------------------
 * The shape, and why it is a fill
 * --------------------------------------------------------------------------------------------
 * `kb/design_system/readme.md`: "**Selected / active**: a *fill change*, not a border". So the
 * active tab is a plum-tint fill on a warm-grey track — the same treatment the rail gives its
 * active row — rather than the underline most tab strips use. One idea of "current", spelled the
 * same way in both places.
 *
 * --------------------------------------------------------------------------------------------
 * Accessibility
 * --------------------------------------------------------------------------------------------
 * The full WAI-ARIA tabs pattern, because half of it is worse than none:
 * - a `tablist` with a required accessible name, `tab` children, and a `tabpanel` wired back by
 *   `aria-controls` / `aria-labelledby`;
 * - roving `tabIndex`, so the strip is one Tab stop and the arrows move within it rather than
 *   the browser walking every tab in turn;
 * - Left/Right/Up/Down wrap, Home/End jump to the ends;
 * - automatic activation (moving focus selects), which is the pattern for panels that are cheap
 *   to render — everything here is already in memory.
 *
 * Deliberately **not** `<li>` elements. `check-in-questions/page.test.tsx` indexes
 * `getAllByRole("listitem")` document-wide, so a list here would silently shift what that test
 * believes is the first question on the page.
 *
 * The tabs are `<button role="tab">`. The role override matters: `getAllByRole("button")` does
 * not match them, so a page's own button assertions (`/actions` looks for exactly one "Dismiss")
 * cannot be confused by the strip above them.
 */

import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

/**
 * Generic over the key so a caller's own union survives the round trip. Without it `onChange`
 * would hand back a bare `string`, and every call site would need a cast to put the value back
 * into its own `useState<StatusGroup>` — a cast that would just as happily accept a key that is
 * not in `items` at all.
 */
export interface TabItem<K extends string = string> {
  readonly key: K;
  readonly label: string;
  /** Rendered beside the label and read as part of the tab's name — "Needs review 3". */
  readonly count?: number;
}

export interface TabsProps<K extends string = string> {
  readonly items: readonly TabItem<K>[];
  readonly activeKey: K;
  readonly onChange: (key: K) => void;
  /** Required: a `tablist` with no accessible name is an unnamed landmark in a screen reader. */
  readonly label: string;
  readonly className?: string;
}

/** Shared id scheme, so `Tabs` and `TabPanel` agree without being passed each other's ids. */
function tabId(key: string): string {
  return `tab-${key}`;
}

function panelId(key: string): string {
  return `tabpanel-${key}`;
}

export function Tabs<K extends string>({
  items,
  activeKey,
  onChange,
  label,
  className,
}: TabsProps<K>) {
  // Every tab button is in the DOM whether or not it is selected, so focusing a sibling needs no
  // effect and no animation frame — the node is already there.
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  function select(key: K) {
    onChange(key);
    buttons.current.get(key)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;

    if (next === null) return;
    // Only now: an unhandled key must keep its default (typing, Tab out, browser shortcuts).
    event.preventDefault();
    const target = items[next];
    if (target !== undefined) select(target.key);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={[
        "flex w-fit max-w-full flex-wrap items-center gap-4 rounded-control bg-surface-warm-gray p-4",
        className ?? "",
      ]
        .filter((part) => part.length > 0)
        .join(" ")}
    >
      {items.map((item, index) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            ref={(node) => {
              if (node === null) buttons.current.delete(item.key);
              else buttons.current.set(item.key, node);
            }}
            type="button"
            role="tab"
            id={tabId(item.key)}
            aria-selected={active}
            aria-controls={panelId(item.key)}
            // Roving: the strip is a single Tab stop, and the arrows move inside it.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              "flex min-h-48 items-center gap-8 rounded-control px-16 font-core text-label",
              "transition-colors duration-[var(--duration-fast)] ease-standard",
              "focus-visible:outline-hidden focus-visible:inset-shadow-focus-plum",
              "md:min-h-40",
              active
                ? "bg-surface-card font-bold text-text-link shadow-flat"
                : "font-medium text-text-secondary hover:bg-surface-card",
            ].join(" ")}
          >
            <span className="whitespace-nowrap">{item.label}</span>
            {item.count === undefined ? null : (
              <span
                className={[
                  "flex min-w-24 items-center justify-center rounded-pill px-8 text-micro font-extrabold",
                  active ? "bg-surface-plum-tint text-text-link" : "bg-surface-card text-text-secondary",
                ].join(" ")}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  readonly tabKey: string;
  readonly activeKey: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * The panel for one tab. Renders nothing at all when its tab is not the current one — not hidden,
 * absent — so an inactive panel's controls are never in the tab order and its content is never
 * found by a test (or a browser's find-in-page) that is looking at the visible screen.
 *
 * No `tabIndex={0}`: the ARIA pattern asks for that only when a panel holds nothing focusable,
 * and every panel here holds cards, links or buttons.
 */
export function TabPanel({ tabKey, activeKey, children, className }: TabPanelProps) {
  if (tabKey !== activeKey) return null;
  return (
    <div
      role="tabpanel"
      id={panelId(tabKey)}
      aria-labelledby={tabId(tabKey)}
      className={className}
    >
      {children}
    </div>
  );
}

export default Tabs;
