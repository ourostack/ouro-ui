import type { JSX } from "react";
import { counts } from "virtual:site-home-facts";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { WHY } from "./why-copy";
import { href } from "../paths";
import { Container } from "./layout";

/*
 * "Why you can stop thinking about it", right under the hero (launch copy deck, section 3.2): part of the page's first
 * script, because an island this near the top would load at once. Its counts come from their sources when the site
 * builds (virtual:site-home-facts, site/scripts/home-facts.mts).
 */

/** "Why you can stop thinking about it": the hard part, what Ouro UI does about it, and five reasons, under hairlines. */
export function Why(): JSX.Element {
  const { native, people, yes, check, beside } = WHY.reasons;
  return (
    <section id="why" aria-labelledby="site-why-title" className="pt-10 pb-6 lg:pt-14 lg:pb-10" data-site-why="">
      <Container>
        <p className="site-eyebrow">{WHY.eyebrow}</p>
        <h2 id="site-why-title" className="site-h2 mt-4">
          {WHY.title}
        </h2>
        <p className="site-lede mt-5 mb-0 max-w-(--measure-lede-wide)">{WHY.body}</p>
        <p className="mt-4 mb-0 max-w-(--measure-lede-wide) text-sm text-muted-foreground">{WHY.credit}</p>
        <ol className="m-0 mt-10 grid list-none gap-x-8 gap-y-6 p-0 sm:grid-cols-2 lg:grid-cols-3" aria-label="Five reasons">
          <li className="grid content-start gap-1.5 border-t border-border/70 pt-4" data-site-why-item="native">
            <h3 className="site-kit-heading">{native.title}</h3>
            <p className="site-kit-line" data-site-counts="">
              {native.lead} {counts.web} on the web, {counts.apple} on Apple, {counts.windows} on Windows, {counts.android} on Android, and{" "}
              <Link href={href(native.coverage.href)} tone="secondary" inline>
                {native.coverage.label}
              </Link>
              .
            </p>
          </li>
          <li className="grid content-start gap-1.5 border-t border-border/70 pt-4" data-site-why-item="people">
            <h3 className="site-kit-heading">{people.title}</h3>
            <p className="site-kit-line">{people.line}</p>
          </li>
          <li className="grid content-start gap-1.5 border-t border-border/70 pt-4" data-site-why-item="yes">
            <h3 className="site-kit-heading">{yes.title}</h3>
            <p className="site-kit-line">{yes.line}</p>
          </li>
          <li className="grid content-start gap-1.5 border-t border-border/70 pt-4" data-site-why-item="check">
            <h3 className="site-kit-heading">{check.title}</h3>
            <p className="site-kit-line">{check.line}</p>
          </li>
          <li className="grid content-start gap-1.5 border-t border-border/70 pt-4" data-site-why-item="beside">
            <h3 className="site-kit-heading">{beside.title}</h3>
            <p className="site-kit-line">
              {beside.line}{" "}
              <Link href={href(beside.company.href)} tone="secondary" inline>
                {beside.company.label}
              </Link>
            </p>
          </li>
        </ol>
      </Container>
    </section>
  );
}

