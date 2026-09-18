import { redirect } from "next/navigation";

/**
 * The front door.
 *
 * Until now this was the Phase 0 token-proof page, so the first thing anyone saw at
 * app.kaylahealth.com was a grid of colour swatches. That page still exists, at `/debug-tokens`,
 * because it is genuinely useful for checking the generated tokens in a real browser — it just
 * has no business being the product's entry point.
 *
 * There is no marketing site to land on and only one thing an HR admin can do here, so `/` goes
 * straight to sign-in rather than offering a page whose only content is a link to it.
 *
 * Note for anyone debugging a "no organisation" message on the other side: the sign-in form needs
 * `?org=<uuid>`, which it then remembers in localStorage. That parameter belongs on the invitation
 * link each organisation is given; it is deliberately not something a person is asked to type.
 */
export default function Home(): never {
  redirect("/login");
}
