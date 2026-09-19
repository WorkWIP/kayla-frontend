import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandWordmark } from "@/components/brand-wordmark";
import { OrgSignupVerifyFromUrl } from "@/components/org-signup-verify-flow";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * `/signup/verify` — where the organisation-signup verification email lands.
 *
 * This path is not an accident and is not interchangeable with `/auth/signup-verify`:
 * `kayla.email.templates.ORG_SIGNUP_VERIFICATION_PATH` is `"/signup/verify"`, while
 * `EMAIL_VERIFICATION_PATH` (the separate *worker* signup flow, redeemed against
 * `POST /auth/signup/verify`) owns the other one. Two flows, two tokens, two endpoints, two
 * routes — moving either would break a link already sitting in somebody's inbox.
 *
 * The shell is a Server Component; the boundary below is the one thing that has to be a client:
 * `useSearchParams` reads the token out of the URL, and Next.js requires a `<Suspense>` around
 * anything that does, so the rest of the route can still be prerendered.
 *
 * `noindex, nofollow` here rather than `/signup`'s `noindex, follow`: this URL carries a
 * single-use token in its query string, and a crawler that followed it would redeem it.
 */

export const metadata: Metadata = {
  title: "Confirm your email — Kayla Health",
  description: "Confirm a work email address and finish creating an organization on Kayla Health.",
  robots: { index: false, follow: false },
};

export default function OrgSignupVerifyPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-32 p-32">
      <BrandWordmark />

      <PageHeader
        eyebrow="Create your organization"
        title="Confirm and finish"
        description="The last step. Setting a password creates the organization and signs this browser in."
      />

      <Suspense fallback={<PageSkeleton label="Confirming your link…" shape="form" count={1} />}>
        <OrgSignupVerifyFromUrl />
      </Suspense>
    </main>
  );
}
