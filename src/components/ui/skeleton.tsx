/**
 * Loading placeholders.
 *
 * Every page-level load in this app used to be one line: `<p role="status">Loading X…</p>`.
 * The announcement half of that was right and is kept verbatim — several tests assert
 * `getByRole("status").textContent` contains "Loading", and the `(dashboard)/__tests__/
 * no-individual-care-usage` crawl waits for exactly that node to disappear before reading a
 * page. What is added is the visual half: shaped blocks that pre-draw the layout that is about
 * to arrive, so the screen does not jump.
 *
 * The blocks are `aria-hidden`; the sentence is `sr-only`. A screen-reader user gets one
 * sentence, not a list of empty boxes, and a sighted user gets the layout, not a sentence.
 * `motion-safe:` on the pulse so "reduce motion" really does.
 */

export interface SkeletonProps {
  /** Sizing and shape only — `h-24 w-full`, `size-40 rounded-full`, … */
  readonly className?: string;
}

/** One placeholder block. Decorative by construction. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[
        "block shrink-0 rounded-control bg-surface-warm-gray motion-safe:animate-pulse",
        className ?? "",
      ]
        .filter((part) => part.length > 0)
        .join(" ")}
    />
  );
}

/** A card-shaped placeholder, for a grid or list of cards. */
export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-12 rounded-card border border-hairline-lilac bg-surface-card p-24 shadow-elevation-card">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-40 w-80" />
      <Skeleton className="h-12 w-64" />
    </div>
  );
}

export type PageSkeletonShape = "grid" | "list" | "form";

export interface PageSkeletonProps {
  /**
   * What is loading, as a sentence. Keep the word "Loading" in it: page tests assert on it, and
   * it is the whole announcement a screen reader gets.
   */
  readonly label: string;
  readonly shape?: PageSkeletonShape;
  /** How many cards/rows to pre-draw. */
  readonly count?: number;
}

/**
 * The page-level load. One `role="status"` per page — never two, or `getByRole("status")` in the
 * page tests becomes ambiguous.
 */
export function PageSkeleton({ label, shape = "list", count = 3 }: PageSkeletonProps) {
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-16">
      <span className="sr-only">{label}</span>
      {shape === "grid" ? (
        <div className="grid grid-cols-1 gap-16 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : null}
      {shape === "list" ? (
        <div className="flex flex-col gap-16">
          {items.map((index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : null}
      {shape === "form" ? (
        <div className="flex flex-col gap-16 rounded-card border border-hairline-lilac bg-surface-card p-24 shadow-elevation-card">
          <Skeleton className="h-16 w-80" />
          {items.map((index) => (
            <div key={index} className="flex flex-col gap-8">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-48 w-full" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default Skeleton;
