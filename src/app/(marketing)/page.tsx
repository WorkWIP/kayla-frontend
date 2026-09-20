import type { Metadata } from "next";

import { BrandWordmark } from "@/components/brand-wordmark";
import { HeroIllustration } from "@/components/hero-illustration";
import { LinkButton } from "@/components/ui/button";

/**
 * `/` — the product's public front door.
 *
 * --------------------------------------------------------------------------------------------
 * A Server Component, on purpose
 * --------------------------------------------------------------------------------------------
 * This is the one page in the app that strangers, search crawlers and link unfurlers reach
 * before anything else, so the title, the description and the OpenGraph card have to be in the
 * first HTML response rather than assembled after a bundle boots. It has no session dependency
 * — nothing here reads `getSession()` — so there is no reason for it to be a Client Component
 * and one good reason for it not to be. `LinkButton` is a `next/link` in the button skin and is
 * server-renderable; `components/ui/` deliberately ships no barrel, so importing that one module
 * does not drag `field.tsx` or `modal.tsx`'s `"use client"` into this tree behind it.
 *
 * --------------------------------------------------------------------------------------------
 * Where every sentence on this page comes from
 * --------------------------------------------------------------------------------------------
 * None of it is invented, because the honest version is better than anything invention would
 * produce and because inventing here would put marketing copy out of step with what the product
 * does. Sources, in order of appearance:
 *
 * * The headline and subhead are `kb/design_system/readme.md`'s own opening paragraphs: "an
 *   onboarding and support companion for frontline healthcare workers — home health aides, CNAs,
 *   LPNs — and for the employers who hire them", "built around a **90-day journey**: a new
 *   hire's first three months, tracked as milestones, check-ins, coaching conversations and
 *   earned badges", and "Cohort-level engagement and retention metrics for the employer".
 * * The trust strip is `kb/MVP-SPEC.md` §5.5's constraint table and the worker-facing privacy
 *   screen those constraints exist to honour (`kayla-mobile/src/i18n/locales/en/onboarding.json`,
 *   `privacy.point1Title` / `privacy.point1Body`: "Your employer sees patterns, not your
 *   answers"). `/login`'s own description sentence says the same thing to the same audience and
 *   is echoed here rather than re-written.
 *
 * Each privacy claim used to carry a second sentence narrowing it. Those are gone: the claim is
 * the load-bearing half, and four lines are read at a glance where eight were skipped.
 *
 * There are **no statistics, customer names, testimonials or prices** on this page. The repo
 * contains none that are real, and the one ROI model in it (`kb/kaylahealth-demo`'s turnover
 * calculator) is explicitly illustrative. A number invented here would be a claim the product
 * cannot stand behind.
 *
 * --------------------------------------------------------------------------------------------
 * Voice
 * --------------------------------------------------------------------------------------------
 * `kb/design_system/readme.md`: "**HR dashboard voice shifts to clinical neutrality** — third
 * person, no reassurance." So: no "we", no "you'll love", no exclamation. Sentence case
 * headings; `UPPERCASE` only on the tracked eyebrow. Em dashes carry the qualifier, which is the
 * house habit — "any feature that could be mistaken for surveillance … is followed by a
 * sentence that narrows it". No emoji anywhere (the readme allows them in exactly one place, the
 * mobile mood scale). Buttons are short verbs.
 *
 * --------------------------------------------------------------------------------------------
 * One screen, and the mark is the picture
 * --------------------------------------------------------------------------------------------
 * This page does not scroll. The frame is `h-dvh overflow-hidden`, the copy sits in the left
 * half and the brand mark fills the right, cropped by the edge of the window. A front door that
 * scrolls is a front door that buries its own call to action, and everything a visitor needs in
 * order to decide — what this is, who it is for, what it will and will not show their employer,
 * and the two ways in — fits in one view.
 *
 * The copy column keeps `overflow-y-auto` as a safety valve. At any ordinary window there is
 * nothing to scroll and no scrollbar appears; on something very short it gives way rather than
 * clipping the buttons, which is the failure mode a fixed-height page otherwise has.
 *
 * The right half is `HeroIllustration` — the ninety-day journey drawn as a line with its four
 * milestone check-ins on it, and beside it the two things an employer actually receives. It
 * replaced the brand mark at size, which filled the same space and said only that there is a
 * letter K. See that component for why it carries no numerals and no labels.
 *
 * The mark still opens the page, as type, in the header wordmark. Below `lg` the illustration is
 * dropped rather than shrunk: on a phone the copy and the two buttons need the whole width, and
 * a decoration that pushes the primary action off a non-scrolling screen is worse than no
 * decoration.
 *
 * Still no photography, no texture, no gradient and no `backdrop-filter` — the design system
 * forbids all four, and this needs none of them.
 */

const DESCRIPTION =
  "Kayla Health supports frontline healthcare workers through their first 90 days and reports " +
  "engagement and retention to their employer at the cohort level. The dashboard shows " +
  "group-level patterns, never an individual worker's answers.";

export const metadata: Metadata = {
  title: "Kayla Health — onboarding support for frontline healthcare workers",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Kayla Health",
    title: "Kayla Health — onboarding support for frontline healthcare workers",
    description: DESCRIPTION,
    // `metadataBase` is set on the root layout from `NEXT_PUBLIC_APP_URL`, so a relative URL here
    // resolves against the real deployment rather than being hardcoded per environment.
    url: "/",
  },
  // No `images`: there is no logo file and none may be drawn (see the module docstring), so a
  // card image would have to be invented. An unfurl with a real title and description and no
  // picture is honest; one with a made-up graphic is not.
  alternates: { canonical: "/" },
};

/** One privacy guarantee, as the single sentence a visitor will actually read. */
interface PrivacyPoint {
  readonly claim: string;
}

/**
 * Drawn from `kb/MVP-SPEC.md` §5.5's table, one row each, and stated in the HR-facing register.
 *
 * Deliberately no minimum cohort *number*: §5.5 records min-N suppression as `[?Q-45]`, an open
 * question, and `kb/kaylahealth-demo`'s "n < 5" is the demo's placeholder rather than a settled
 * threshold. Naming a figure here would be inventing a statistic.
 */
const PRIVACY_POINTS: readonly PrivacyPoint[] = [
  { claim: "The employer sees group-level patterns, never an individual's answers." },
  { claim: "Free-text answers never reach the dashboard." },
  { claim: "Aggregate rates are suppressed below a minimum cohort size." },
  { claim: "Workers are told this in the app, before they are asked anything." },
];

export default function LandingPage() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <header className="flex w-full shrink-0 items-center justify-between gap-16 px-24 py-16 lg:px-40">
        <BrandWordmark />
        {/* `→` marks a soft cross-screen link rather than the primary action, which is the
            design system's own convention for exactly this distinction. */}
        <LinkButton href="/login" variant="ghost" size="sm">
          Sign in →
        </LinkButton>
      </header>

      <main className="flex min-h-[0] w-full flex-1 flex-col lg:flex-row lg:items-stretch">
        {/*
          The copy. `overflow-y-auto` is the safety valve described in the module docstring —
          invisible at any ordinary window, and the difference between "gives way" and "clips the
          buttons" on something very short.
        */}
        <div className="flex min-h-[0] flex-1 flex-col justify-center gap-32 overflow-y-auto px-24 py-24 lg:px-40 lg:py-40">
          <div className="flex max-w-2xl flex-col gap-20">
            <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
              For HR and operations
            </p>

            {/*
              `text-hero` is the design system's 48-unit brand-hero step, and it is right only
              when there is room for it. The headline steps down on shorter, narrower windows so
              that the whole page still fits one view — the constraint this page is built around.
              The weight is set explicitly because the type tokens ship a size and a line-height
              for the hero but no paired `--font-weight`; the specimen calls it "48/800".

              The readme also specifies −0.8 tracking for the wordmark, which the design system
              ships no token for and which `lint:tokens` would reject written as a raw value. The
              rail's own wordmark omits it for the same reason; this matches that rather than
              inventing a one-off.
            */}
            <h1 className="text-display-2 font-extrabold text-text-primary xl:text-display-1 2xl:text-hero">
              Onboarding support for frontline healthcare workers, and cohort-level metrics for
              their employers.
            </h1>

            <p className="text-body text-text-secondary">
              Built around a 90-day journey: a new hire&rsquo;s first three months, tracked as
              milestones, check-ins and conversations with Kayla.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-16">
            <LinkButton href="/signup">Create your organization</LinkButton>
            <LinkButton href="/login" variant="secondary">
              Sign in
            </LinkButton>
          </div>

          {/*
            The trust strip. It is not a feature list dressed up as one: the constraints below are
            the product's central premise per `kb/MVP-SPEC.md` §5.5 ("described in its PRD as the
            product's central premise, not as demo-only simplifications"), and they are the reason
            a worker answers a check-in honestly at all.

            Two columns where there is room, because four short lines in one column reads as a
            list to get through and four in two columns reads as a shape to take in.
          */}
          <section
            aria-labelledby="privacy-heading"
            className="flex max-w-2xl flex-col gap-12 rounded-card-lg bg-surface-plum-tint p-24 inset-shadow-plum-tint"
          >
            <h2 id="privacy-heading" className="text-label font-bold text-text-primary">
              Who sees what
            </h2>
            <ul className="grid list-none grid-cols-1 gap-x-24 gap-y-8 p-[0] sm:grid-cols-2">
              {PRIVACY_POINTS.map((point) => (
                <li key={point.claim} className="flex items-start gap-8">
                  {/* A dot, not a bullet glyph and not an icon: the design system allows no
                      filled icons, and a list marker is not information. */}
                  <span
                    aria-hidden="true"
                    className="mt-8 size-4 shrink-0 rounded-full bg-brand-primary"
                  />
                  <span className="text-copy text-text-secondary">{point.claim}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/*
          The illustration. Hidden below `lg`, where there is no second column to put it in and
          the copy needs the whole width — see the module docstring.

          Padded rather than bled: unlike a cropped letterform, this composition means something
          only when all of it is visible, so the frame gives it room instead of trimming it.
        */}
        <div className="hidden min-w-[0] items-center justify-center bg-surface-plum-tint p-48 lg:flex lg:flex-1">
          <HeroIllustration />
        </div>
      </main>
    </div>
  );
}
