import type { JSX, ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { TWO_SHIPS } from "./copy";
import { href } from "../paths";
import { Container } from "./layout";
import { art } from "./stage/art";

const SPOONJOY_KITCHEN = "https://spoonjoy.app/test-kitchen";
const SPOONJOY_SOURCE = "https://github.com/spoonjoy/spoonjoy-v2";

/** The Nautilus in profile, the stage's own drawing, coloured from the theme (stage.css); its one id renamed so the page has it once. */
const SHIP = art.nautilus.inner.replaceAll("nautilus-sheen", "ship-card-sheen");

/** One showcase: open text on the page under a hairline, no card around it. */
function Showcase({ id, title, body, children }: { id: string; title: string; body: string; children: ReactNode }): JSX.Element {
  return (
    <article aria-labelledby={`${id}-title`} className="site-ship grid content-start gap-4 border-t border-border pt-6" data-site-ship={id}>
      <h3 id={`${id}-title`} className="site-h3">
        {title}
      </h3>
      <p className="m-0 max-w-[46ch] text-muted-foreground" id={`${id}-body`}>
        {body}
      </p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </article>
  );
}

/** "Two ships, same parts.": two showcases of Ouro HX, the Nautilus (made up to show it off) and Spoonjoy (a real app). */
export function TwoShips(): JSX.Element {
  const { nautilus, spoonjoy } = TWO_SHIPS;
  return (
    <section aria-labelledby="ships-title" id="ships" className="py-20 lg:py-28">
      <Container>
        <div className="grid items-center gap-x-12 gap-y-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="site-eyebrow">{TWO_SHIPS.eyebrow}</p>
            <h2 id="ships-title" className="site-h2 mt-4">
              {TWO_SHIPS.title}
            </h2>
            <p className="site-lede mt-5 mb-0 max-w-[44ch]">{TWO_SHIPS.intro}</p>
          </div>
          <svg aria-hidden="true" viewBox={art.nautilus.viewBox} className="site-ship-nautilus" dangerouslySetInnerHTML={{ __html: SHIP }} />
        </div>
        <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:mt-16">
          <Showcase id="ship-nautilus" title={nautilus.title} body={nautilus.body}>
            <Button href={href("/nautilus/")}>{nautilus.open}</Button>
            <Button href={href("/nautilus/?xray")} variant="outline" tone="secondary" aria-describedby="ship-nautilus-title">
              {nautilus.xray}
            </Button>
          </Showcase>
          <Showcase id="ship-spoonjoy" title={spoonjoy.title} body={spoonjoy.body}>
            <Button href={SPOONJOY_KITCHEN}>{spoonjoy.open}</Button>
            <Button href={`${SPOONJOY_KITCHEN}?xray`} variant="outline" tone="secondary" aria-describedby="ship-spoonjoy-title">
              {spoonjoy.xray}
            </Button>
            <a href={SPOONJOY_SOURCE} className="site-quiet-link">
              {spoonjoy.source}
            </a>
          </Showcase>
        </div>
      </Container>
    </section>
  );
}
