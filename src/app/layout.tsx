import type { Metadata } from "next";
import type { ReactNode } from "react";

import { env } from "@/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: "Kayla Health",
  description: "The Kayla Health HR dashboard.",
};

// Typed explicitly rather than with Next's generated `LayoutProps<"/">` global: that type only
// exists once `.next/types` has been generated, which would make `npm run typecheck` fail on a
// clean checkout and pass only after a build.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/*
          Plus Jakarta Sans is loaded by its real family name so that the generated token
          --font-core ("Plus Jakarta Sans", -apple-system, ...) resolves to it verbatim.
          next/font would register the face under a hashed family name instead, which would
          mean overriding the token's font stack in app code — an R5 violation.
          Weights are the five the design system actually uses (agents.md §5.4); the .ttf
          binaries needed by kayla-mobile are still an open blocker there, not here.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          The rule below fires on any Google Fonts stylesheet outside pages/_document. Its
          premise — "the font will load for a single page only" — does not hold in the App
          Router: there is no pages/_document, and this root layout wraps every route.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- see the note above */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
