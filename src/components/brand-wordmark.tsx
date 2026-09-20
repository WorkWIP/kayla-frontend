/**
 * The Kayla Health wordmark, rendered as type.
 *
 * --------------------------------------------------------------------------------------------
 * There is a logo now, and this is it
 * --------------------------------------------------------------------------------------------
 * `kb/design_system/readme.md` used to be explicit that there was no logo file and that nobody
 * should draw one — so this set the product's name as type beside a plum disc carrying the
 * initials `KH`, which was the honest answer to "we have no mark". A real mark has since been
 * supplied (`kb/design_system/assets/brand/kayla-logo.png`), so the disc gives way to it.
 *
 * `BrandMark` renders it in one plum ink; see that file for why the supplied teal is not used in
 * chrome. The rail's brand block uses the same component, so the public front door and the
 * signed-in application are recognisably the same product.
 *
 * Deliberately **not** a Client Component. The landing page is a Server Component with real
 * metadata (it is the product's public, indexable front door), and a `"use client"` directive
 * anywhere in its tree would drag the whole subtree into the browser bundle for a heading that
 * never changes. `components/ui/` has no barrel for the same reason — import the module, not an
 * index that would pull a `"use client"` primitive in behind it.
 */

import { BrandMark } from "@/components/brand-mark";

/** The product's name in user-facing copy. `sidebar-nav.tsx` holds the same string. */
export const BRAND_NAME = "Kayla Health";

/**
 * The initials the mark replaced. Still exported, and still the right answer anywhere a customer
 * organisation has to be identified by name rather than by our own mark — which is what
 * `sidebar-nav.tsx`'s `brandInitialsFor` derives.
 */
export const BRAND_INITIALS = "KH";

export type BrandWordmarkSize = "md" | "lg";

/**
 * The mark, and the type beside it, at two densities.
 *
 * `md` is the rail's own 40-unit mark with a `text-title` name — for page chrome.
 * `lg` is one spacing step up, for the one place this is the largest thing above the headline.
 */
const MARK_SIZE: Readonly<Record<BrandWordmarkSize, "md" | "lg">> = {
  md: "md",
  lg: "lg",
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
      {/* The mark carries no information the name beside it does not already carry, so it is
          hidden from assistive technology rather than announced twice. */}
      <BrandMark size={MARK_SIZE[size]} />
      <span className={["font-core font-extrabold text-text-primary", NAME_CLASS[size]].join(" ")}>
        {BRAND_NAME}
      </span>
    </span>
  );
}

export default BrandWordmark;
