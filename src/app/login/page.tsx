import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * `/login` — the HR dashboard sign-in screen (agents.md §10.1 task 7).
 *
 * The shell is a Server Component so the heading, the explanation and the page chrome are in the
 * first HTML response; only `<LoginForm>` ships as client JavaScript. It has to: `useSearchParams`
 * reads the organisation out of the invitation link, which is URL data, and Next.js requires any
 * component that reads URL data to sit under a `<Suspense>` boundary so the rest of the route can
 * still be prerendered.
 *
 * Every value on this screen resolves to a token in `src/styles/tokens.css` — agents.md R5 and
 * §11.2 #13. `npm run lint:tokens` is the enforcement.
 */

export const metadata: Metadata = {
  title: "Sign in — Kayla Health",
  description: "Sign in to the Kayla Health HR dashboard.",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-32 p-32">
      <PageHeader
        eyebrow="Kayla Health"
        title="Sign in"
        description="The HR dashboard shows aggregates for your organisation. It never shows an individual worker’s messages, mood answers or Care usage."
      />

      {/*
        The fallback is announced rather than silent: on a slow connection the region below is
        empty for long enough that a screen-reader user would otherwise be told nothing at all.
      */}
      <Suspense fallback={<PageSkeleton label="Loading the sign-in form…" shape="form" count={2} />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
