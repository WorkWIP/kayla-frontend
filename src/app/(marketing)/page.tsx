import type { Metadata } from "next";

import { BrandWordmark } from "@/components/brand-wordmark";
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
 * No logo, and none drawn
 * --------------------------------------------------------------------------------------------
 * `kb/design_system/readme.md`: "**There is no logo file in the source.** No wordmark SVG, no app
 * icon, no lockup. … Do not draw a logo — ask for one." `BrandWordmark` therefore sets the name
 * as type beside the established `KH` plum disc, and nothing on this page is an illustration.
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

/** One privacy guarantee: what the dashboard does, and the sentence that narrows it. */
interface PrivacyPoint {
  readonly claim: string;
  readonly bound: string;
}

/**
 * Drawn from `kb/MVP-SPEC.md` §5.5's table, one row each, and stated in the HR-facing register.
 *
 * Deliberately no minimum cohort *number*: §5.5 records min-N suppression as `[?Q-45]`, an open
 * question, and `kb/kaylahealth-demo`'s "n < 5" is the demo's placeholder rather than a settled
 * threshold. Naming a figure here would be inventing a statistic.
 */
const PRIVACY_POINTS: readonly PrivacyPoint[] = [
  {
    claim: "The employer sees group-level patterns, never an individual's answers.",
    bound:
      "No worker's name appears beside a sentiment score, a mood response, a question asked, or Care usage — on any dashboard screen.",
  },
  {
    claim: "Free-text answers never reach the dashboard.",
    bound: "Not as quotes, not as excerpts, not as paraphrases, and not in an export.",
  },
  {
    claim: "Aggregate rates are suppressed below a minimum cohort size.",
    bound:
      "A group too small to be anonymous is reported as suppressed rather than as a number.",
  },
  {
    claim: "Workers are told this in the app, before they are asked anything.",
    bound: "The same guarantee, in the same words, on the onboarding privacy screen.",
  },
];

export default function LandingPage() {
  return (
    <>
      <header className="flex w-full items-center justify-between gap-16 px-24 py-24">
        <BrandWordmark />
        {/* `→` marks a soft cross-screen link rather than the primary action, which is the
            design system's own convention for exactly this distinction. */}
        <LinkButton href="/login" variant="ghost" size="sm">
          Sign in →
        </LinkButton>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-48 px-24 py-48">
        <div className="flex flex-col gap-24">
          <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
            For HR and operations
          </p>

          {/*
            `text-hero` is the design system's 48-unit brand-hero step. It has existed since the
            tokens were generated and has never been used — this page is what it is for. The
            weight is set explicitly because `--text-hero` ships a size and a line-height but no
            paired `--font-weight`; the specimen calls the brand hero "48/800", so `extrabold`.

            The readme also specifies −0.8 tracking for the wordmark, which the design system
            ships no token for and which `lint:tokens` would reject written as a raw value. The
            rail's own wordmark (`sidebar-nav.tsx`) omits it for the same reason; this matches
            that rather than inventing a one-off.
          */}
          <h1 className="text-hero font-extrabold text-text-primary">
            Onboarding support for frontline healthcare workers — and cohort-level metrics for the
            employers who hire them.
          </h1>

          <p className="max-w-2xl text-body text-text-secondary">
            Kayla Health is built around a 90-day journey: a new hire&rsquo;s first three months,
            tracked as milestones, check-ins and conversations with Kayla. Home health aides, CNAs
            and LPNs get support in the app. The HR dashboard reports engagement and retention by
            cohort.
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
        */}
        <section
          aria-labelledby="privacy-heading"
          className="flex flex-col gap-20 rounded-card-lg bg-surface-plum-tint p-32 inset-shadow-plum-tint"
        >
          <div className="flex flex-col gap-8">
            <h2 id="privacy-heading" className="text-title text-text-primary">
              Who sees what
            </h2>
            <p className="text-body text-text-secondary">
              The HR dashboard shows aggregates for an organisation. It never shows an individual
              worker&rsquo;s messages, mood answers or Care usage.
            </p>
          </div>

          <ul className="flex flex-col gap-16">
            {PRIVACY_POINTS.map((point) => (
              <li key={point.claim} className="flex flex-col gap-4">
                <p className="text-label font-bold text-text-primary">{point.claim}</p>
                <p className="text-copy text-text-secondary">{point.bound}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-24 py-24">
        <p className="text-meta text-text-tertiary">
          Kayla Health — onboarding and support for home care and senior living.
        </p>
      </footer>
    </>
  );
}
