import type { Metadata } from "next";
import Link from "next/link";

import { BrandWordmark } from "@/components/brand-wordmark";
import { OrgSignupForm } from "@/components/org-signup-form";
import { PageHeader } from "@/components/ui/page-header";

/**
 * `/signup` — step one of organisation self-signup.
 *
 * The shell is a Server Component so the heading and the explanation are in the first HTML
 * response; only `<OrgSignupForm>` ships as client JavaScript, because only it has state. Unlike
 * `/login` there is no `<Suspense>` boundary here: nothing on this screen reads the URL, so
 * nothing needs one.
 *
 * `noindex` is deliberate and is the one place this flow differs from `/` in metadata terms. The
 * landing page is the front door and should be indexed; a form is not a destination a search
 * result should land on, and the verify step below it carries a single-use token in its query
 * string.
 */

export const metadata: Metadata = {
  title: "Create your organization — Kayla Health",
  description:
    "Start an organization on Kayla Health with a work email address. The address is confirmed before anything is created.",
  robots: { index: false, follow: true },
};

export default function OrgSignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-32 p-32">
      <BrandWordmark />

      <PageHeader
        eyebrow="Create your organization"
        title="Start with a work email"
        description="The address is confirmed by email before an organization is created. The person who completes signup becomes its first owner."
      />

      <OrgSignupForm />

      <p className="text-copy text-text-secondary">
        Already set up?{" "}
        <Link href="/login" className="text-text-link underline underline-offset-2">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
