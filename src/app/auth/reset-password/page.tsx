import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordFromUrl } from "@/components/reset-password-flow";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * `/auth/reset-password` — where the password-reset email lands.
 *
 * This exact path is not arbitrary: `kayla.email.templates.PASSWORD_RESET_PATH` is
 * `"/auth/reset-password"`, already hardcoded into every reset email sent. Moving this route
 * breaks every link already sitting in an inbox.
 *
 * The shell is a Server Component; `<ResetPasswordFromUrl>` reads `?token=` via `useSearchParams`,
 * which Next.js requires to sit under a `<Suspense>` boundary.
 *
 * `noindex, nofollow`: this URL carries a single-use token in its query string, and a crawler
 * that followed it would redeem it.
 */

export const metadata: Metadata = {
  title: "Set a new password — Kayla Health",
  description: "Set a new password for your Kayla Health HR dashboard account.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-32 p-32">
      <PageHeader eyebrow="Kayla Health" title="Set a new password" />

      <Suspense fallback={<PageSkeleton label="Confirming your link…" shape="form" count={1} />}>
        <ResetPasswordFromUrl />
      </Suspense>
    </main>
  );
}
