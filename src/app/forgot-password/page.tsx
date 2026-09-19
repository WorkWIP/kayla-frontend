import type { Metadata } from "next";

import { ForgotPasswordFlow } from "@/components/forgot-password-flow";
import { PageHeader } from "@/components/ui/page-header";

/**
 * `/forgot-password` — requests a password-reset link (`POST /auth/password-reset/request`).
 *
 * A Server Component throughout: unlike `/login` and `/auth/reset-password`, this form reads no
 * URL data, so it needs no `useSearchParams` and therefore no `<Suspense>` boundary.
 *
 * `noindex, nofollow`: this is a step in an account-recovery flow, not a page anyone should land
 * on from a search result.
 */

export const metadata: Metadata = {
  title: "Reset your password — Kayla Health",
  description: "Request a link to reset your Kayla Health HR dashboard password.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-32 p-32">
      <PageHeader
        eyebrow="Kayla Health"
        title="Reset your password"
        description="Enter the work email you sign in with, and we will send a link to set a new password."
      />
      <ForgotPasswordFlow />
    </main>
  );
}
