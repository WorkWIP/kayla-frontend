/**
 * The Kayla Health wordmark, rendered as type.
 *
 * --------------------------------------------------------------------------------------------
 * Why there is no image here, and why there must not be one
 * --------------------------------------------------------------------------------------------
 * `kb/design_system/readme.md` is explicit: there is no logo file in the source, the brand
 * renders as type, and nobody is to draw one — it is a thing to ask a designer for, not a thing
 * to invent in a component. So this file sets the product's name in the core family at the weight
 * the specimen names for a brand lockup, and stops there.
 *
 * The disc is the other half of the established mark, not a second invention: `sidebar-nav.tsx`
 * already draws a plum disc carrying two initials (`BRAND_INITIALS = "KH"`) at
 * `size-40 rounded-full bg-bg-inverse … text-text-inverse`, and this reuses that exact treatment
 * so the public front door and the signed-in rail are recognisably the same product.
 *
 * Deliberately **not** a Client Component. The landing page is a Server Component with real
 * metadata (it is the product's public, indexable front door), and a `"use client"` directive
 * anywhere in its tree would drag the whole subtree into the browser bundle for a heading that
 * never changes. `components/ui/` has no barrel for the same reason — import the module, not an
 * index that would pull a `"use client"` primitive in behind it.
 */

/** The product's name in user-facing copy. `sidebar-nav.tsx` holds the same string. */
export const BRAND_NAME = "Kayla Health";

/** The app mark's two letters. Matches `sidebar-nav.tsx`'s `BRAND_INITIALS`. */
export const BRAND_INITIALS = "KH";

export type BrandWordmarkSize = "md" | "lg";

/**
 * The disc, and the type beside it, at two densities.
 *
 * `md` is the rail's own 40-unit disc with a `text-title` name — for page chrome.
 * `lg` is one spacing step up, for the one place this is the largest thing above the headline.
 */
const DISC_CLASS: Readonly<Record<BrandWordmarkSize, string>> = {
  md: "size-40 text-label",
  lg: "size-48 text-title",
};

const NAME_CLASS: Readonly<Record<BrandWordmarkSize, string>> = {
  md: "text-title",
  lg: "text-section",
};

export interface BrandWordmarkProps {
  readonly size?: BrandWordmarkSize;
  readonly className?: string;
}

export function BrandWordmark({ size = "md", className }: BrandWordmarkProps) {
  return (
    <span
      className={["flex items-center gap-12", className ?? ""]
        .filter((part) => part.length > 0)
        .join(" ")}
    >
      {/* The disc carries no information the name beside it does not already carry, so it is
          hidden from assistive technology rather than announced as "K H". */}
      <span
        aria-hidden="true"
        className={[
          "flex shrink-0 items-center justify-center rounded-full bg-bg-inverse font-core font-extrabold text-text-inverse",
          DISC_CLASS[size],
        ].join(" ")}
      >
        {BRAND_INITIALS}
      </span>
      <span className={["font-core font-extrabold text-text-primary", NAME_CLASS[size]].join(" ")}>
        {BRAND_NAME}
      </span>
    </span>
  );
}

export default BrandWordmark;
