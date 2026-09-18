import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";

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
      <header className="flex flex-col gap-8">
        <p className="text-eyebrow font-bold uppercase tracking-eyebrow text-text-secondary">
          Kayla Health
        </p>
        <h1 className="text-display-2 text-text-primary">Sign in</h1>
        <p className="text-body text-text-secondary">
          The HR dashboard shows aggregates for your organisation. It never shows an individual
          worker&rsquo;s messages, mood answers or Care usage.
        </p>
      </header>

      {/*
        The fallback is announced rather than silent: on a slow connection the region below is
        empty for long enough that a screen-reader user would otherwise be told nothing at all.
      */}
      <Suspense
        fallback={
          <p role="status" className="text-body text-text-secondary">
            Loading the sign-in form…
          </p>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
