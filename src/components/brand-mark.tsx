/**
 * The Kayla Health app mark, drawn in one ink.
 *
 * --------------------------------------------------------------------------------------------
 * Why this file exists now, when `brand-wordmark.tsx` says a logo must not be drawn
 * --------------------------------------------------------------------------------------------
 * `kb/design_system/readme.md` says "There is no logo file in the source. … Do not draw a logo —
 * ask for one." That was true when `brand-wordmark.tsx` was written, and its `KH` plum disc was
 * the correct answer to it. It is no longer true: a real mark ships at
 * `kb/design_system/assets/brand/kayla-logo.png` and is copied into this app at
 * `public/brand/kayla-mark.png`. Nothing here is drawn or invented — the shape is the supplied
 * asset, pixel for pixel.
 *
 * --------------------------------------------------------------------------------------------
 * Why a mask rather than an `<img>`
 * --------------------------------------------------------------------------------------------
 * The supplied mark is teal with a persimmon dot. This design system has no teal at all:
 * its chrome is plum, mint and persimmon. Rendering the full-colour asset in the rail would put
 * a fourth, off-system hue beside the plum wordmark — two inks where the system specifies one.
 *
 * So the chrome takes the mark's *shape* and the design system's *colour*: the PNG's alpha
 * channel becomes a CSS mask, and the fill is `--color-brand-primary` (plum-800) like every
 * other piece of brand chrome. The full-colour asset is still used at its own size on the public
 * landing page, which is the one surface that is about the brand rather than about the product.
 *
 * This is also what keeps the file R5-clean. A recoloured copy of the PNG would bake
 * `rgb(73,50,80)` into a binary where no linter can see it, and the day plum changes the asset
 * silently disagrees with the tokens. Here the colour is a `var()` like everything else, so it
 * follows the token.
 *
 * A trace to SVG would be better still — crisper under 24 units, and no second HTTP request —
 * but there is no vector source and no tracer (potrace / imagemagick / inkscape) on this
 * toolchain. The mask is the faithful option available; swapping in an inline `<svg>` later is a
 * change to this file alone.
 *
 * --------------------------------------------------------------------------------------------
 * Accessibility
 * --------------------------------------------------------------------------------------------
 * Always `aria-hidden`. This mark never carries meaning on its own: in the rail it sits inside a
 * button that has its own label, and on the landing page it sits beside the wordmark as type.
 * An accessible name here would be read out twice, once as the mark and once as the words.
 *
 * `data-brand-mark` is not a styling hook — it is the selector for the `forced-colors` fallback
 * in `globals.css`. Windows High Contrast replaces `background-color`, which for a masked element
 * means the mark can vanish entirely; the fallback pins it to `CanvasText` so it stays visible.
 */

/** The asset copied from `kb/design_system/assets/brand/kayla-logo.png`. */
export const BRAND_MARK_SRC = "/brand/kayla-mark.png";

/** The supplied PNG's intrinsic dimensions — needed by `next/image` on the landing page. */
export const BRAND_MARK_WIDTH = 689;
export const BRAND_MARK_HEIGHT = 769;

export type BrandMarkSize = "sm" | "md" | "lg";

/**
 * Token-scale squares. The mark is taller than it is wide (689x769), and `mask-size: contain`
 * letterboxes it inside the square rather than distorting it, so the box is the *bound*, not the
 * drawn size.
 *
 * `md` is 40 to match the disc `SidebarNavigation.prompt.md` specifies for the brand block, which
 * `brand-wordmark.tsx` already uses. `sm` is for the collapsed rail.
 */
const SIZE_CLASS: Readonly<Record<BrandMarkSize, string>> = {
  sm: "size-24",
  md: "size-40",
  lg: "size-48",
};

export interface BrandMarkProps {
  readonly size?: BrandMarkSize;
  readonly className?: string;
}

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      data-brand-mark=""
      className={["block shrink-0 bg-brand-primary", SIZE_CLASS[size], className ?? ""]
        .filter((part) => part.length > 0)
        .join(" ")}
      style={{
        // Both spellings: Safari still needs the prefixed property for mask-image, and the
        // unprefixed one is what every other engine reads.
        WebkitMaskImage: `url(${BRAND_MARK_SRC})`,
        maskImage: `url(${BRAND_MARK_SRC})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

export default BrandMark;
