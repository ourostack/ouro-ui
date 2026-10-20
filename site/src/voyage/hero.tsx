import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { HERO_SUBLINE, HERO_TITLE } from "../copy";
import { href } from "../paths";
import { Container } from "./layout";

/** The first viewport: the promise, and (slice S1b) the porthole stage beside it. */
export function Hero({ onXray }: { onXray: () => void }): JSX.Element {
  return (
    <section aria-labelledby="hero-title" className="pt-14 pb-16 lg:pt-24 lg:pb-24">
      <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="site-eyebrow">Mobilis in mobili · Ouro HX</p>
          <h1 id="hero-title" className="site-h1 mt-5 max-w-[15ch]">
            {HERO_TITLE}
          </h1>
          <p className="site-lede mt-6 max-w-[44ch]">{HERO_SUBLINE}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button href={href("/docs/installing/")} size="lg">
              Come aboard
            </Button>
            <Button variant="outline" tone="secondary" size="lg" onClick={onXray}>
              See how it&rsquo;s built
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
