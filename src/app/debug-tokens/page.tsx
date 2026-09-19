import { LinkButton } from "@/components/ui/button";
import { env } from "@/env";

/**
 * The design-token proof page, at `/debug-tokens`.
 *
 * This was `/` for the whole of P0, which is why signing in to Kayla Health showed colour
 * swatches rather than the dashboard. It keeps its value as a developer tool — it proves,
 * visibly and in a test, that the generated tokens reach the browser — so it moved here rather
 * than being deleted. `/` now redirects to the sign-in page.
 *
 * Every colour, radius, shadow, size and weight below comes from src/styles/tokens.css. There is
 * not a single raw hex or px value in this file — see agents.md R5 and §11.2 #13.
 */

/** Rendered as `background: var(<token>)`, so the swatch fails visibly if the chain breaks. */
const COLOR_TOKENS = [
  "--color-action-primary",
  "--color-action-secondary",
  "--color-accent-recognition",
  "--color-action-accent",
  "--color-bg-subtle-plum",
  "--surface-mint-wash",
] as const;

/** One sample per type utility. `utility` is both the class applied and the caption. */
const TYPE_SPECIMENS = [
  { utility: "text-display-1", sample: "Display one" },
  { utility: "text-section", sample: "Section heading" },
  { utility: "text-title", sample: "Card title" },
  { utility: "text-body", sample: "Body copy — the running text size." },
  { utility: "text-copy", sample: "Supporting copy at the smaller running size." },
] as const;

const CONFIG_ROWS = [
  { label: "Environment", value: env.NEXT_PUBLIC_ENVIRONMENT },
  { label: "API base URL", value: env.NEXT_PUBLIC_API_BASE_URL },
  { label: "App URL", value: env.NEXT_PUBLIC_APP_URL },
] as const;

export default function DebugTokensPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-40 p-32">
      <header className="flex flex-col gap-8">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-secondary">
          Phase 0 &middot; Foundations
        </p>
        <h1 className="text-display-1 text-text-primary">Kayla Health</h1>
        <p className="text-body text-text-secondary">
          The HR dashboard shell. No product surface ships in this phase — this page exists to
          prove the generated design tokens resolve end to end.
        </p>
        {/*
          The shared button skin (`@/components/ui/button`), so this diagnostic page cannot drift
          from the real one. It used to carry its own copy of the class string and leave the
          browser's native focus ring in place; the shared skin swaps that for the design
          system's own `--ring-focus-mint`, which is a visible indicator by the same rule.
        */}
        <LinkButton href="/login">Sign in to the dashboard</LinkButton>
      </header>

      <section aria-labelledby="configuration-heading" className="flex flex-col gap-16">
        <h2 id="configuration-heading" className="text-section text-text-primary">
          Configuration
        </h2>
        <dl className="grid gap-16 rounded-card-lg bg-surface-card p-24 shadow-elevation-card sm:grid-cols-3">
          {CONFIG_ROWS.map((row) => (
            <div key={row.label} className="flex flex-col gap-4">
              <dt className="text-field-label text-text-secondary">{row.label}</dt>
              <dd className="text-copy text-text-primary break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-meta text-text-secondary">
          Read through src/env.ts, which refuses to build when any of the three variables in
          .env.example is missing.
        </p>
      </section>

      <section aria-labelledby="colour-heading" className="flex flex-col gap-16">
        <h2 id="colour-heading" className="text-section text-text-primary">
          Colour tokens
        </h2>
        <ul className="grid list-none grid-cols-2 gap-16 p-[0] sm:grid-cols-3">
          {COLOR_TOKENS.map((token) => (
            <li key={token} className="flex flex-col gap-8">
              <span
                aria-hidden="true"
                data-token={token}
                className="block h-48 w-full rounded-card inset-shadow-lilac"
                style={{ background: `var(${token})` }}
              />
              <code className="text-micro text-text-secondary">{token}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="type-heading" className="flex flex-col gap-16">
        <h2 id="type-heading" className="text-section text-text-primary">
          Type scale
        </h2>
        <ul className="flex list-none flex-col gap-16 p-[0]">
          {TYPE_SPECIMENS.map((specimen) => (
            <li key={specimen.utility} className="flex flex-col gap-4">
              <span className={`${specimen.utility} text-text-primary`}>{specimen.sample}</span>
              <code className="text-micro text-text-secondary">{specimen.utility}</code>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-meta text-text-secondary">
        Every value above resolves to one of the 159 tokens in src/styles/tokens.css, generated
        from kb/design_system/_ds_manifest.json by kb/tools/build-tokens.ts. Edit the manifest,
        never the output.
      </footer>
    </main>
  );
}
