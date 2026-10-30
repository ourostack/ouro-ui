import type { JSX, ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { TWO_SHIPS } from "./copy";
import { href } from "../paths";
import { Container } from "./layout";
import { art } from "./stage/art";

const SPOONJOY_KITCHEN = "https://spoonjoy.app/test-kitchen";
const SPOONJOY_SOURCE = "https://github.com/spoonjoy/spoonjoy-v2";

/** The Nautilus in profile, the stage's own drawing, coloured from the theme (stage.css); its one id renamed so the page has it once. */
const SHIP = art.nautilus.inner.replaceAll("nautilus-sheen", "ship-card-sheen");

function ShipCard({ id, title, body, art: picture, children }: { id: string; title: string; body: ReactNode; art: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <article aria-labelledby={`${id}-title`} className="site-ship grid content-start overflow-hidden rounded-2xl border border-border/70 bg-card shadow-(--shadow-sm)" data-site-ship={id}>
      <div aria-hidden="true" className="site-ship-art">
        {picture}
      </div>
      <div className="grid content-start gap-4 p-5 sm:p-7">
        <h3 id={`${id}-title`} className="site-h3">
          {title}
        </h3>
        <p className="m-0 text-muted-foreground" id={`${id}-body`}>
          {body}
        </p>
        <div className="flex flex-wrap items-center gap-3">{children}</div>
      </div>
    </article>
  );
}

/** "Two ships, same parts.": the Nautilus, built to show Ouro HX off, and Spoonjoy, a real app built with it. */
export function TwoShips(): JSX.Element {
  const { nautilus, spoonjoy } = TWO_SHIPS;
  return (
    <section aria-labelledby="ships-title" id="ships" className="py-20 lg:py-28">
      <Container>
        <p className="site-eyebrow">{TWO_SHIPS.eyebrow}</p>
        <h2 id="ships-title" className="site-h2 mt-4">
          {TWO_SHIPS.title}
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <ShipCard
            id="ship-nautilus"
            title={nautilus.title}
            body={nautilus.body}
            art={<svg viewBox={art.nautilus.viewBox} className="site-ship-nautilus" dangerouslySetInnerHTML={{ __html: SHIP }} />}
          >
            <Button href={href("/nautilus/")}>{nautilus.open}</Button>
            <Button href={href("/nautilus/?xray")} variant="outline" tone="secondary" aria-describedby="ship-nautilus-title">
              {nautilus.xray}
            </Button>
          </ShipCard>
          <ShipCard
            id="ship-spoonjoy"
            title={spoonjoy.title}
            body={
              <>
                {spoonjoy.body[0]}{" "}
                {claim("60 Ouro HX components", { source: { spec: "https://spoonjoy.app/ouro-provenance.json" }, verify: { count: "site/src/docs/spoonjoy.json#items", is: 60 } })}
                {spoonjoy.body[1]}
              </>
            }
            art={
              // Spoonjoy's own tokens (the Cookbook preset, synced from the app), in a plain card: no screenshot to go stale.
              <span data-theme="cookbook" className="site-ship-cookbook">
                <span className="site-ship-cookbook-card">
                  <span className="site-ship-cookbook-name">Spoonjoy</span>
                  <span className="site-ship-cookbook-ink" />
                  <span className="site-ship-cookbook-ink site-ship-cookbook-ink-short" />
                  <span className="site-ship-cookbook-row">
                    <span className="site-ship-cookbook-pill" />
                    <span className="site-ship-cookbook-dot" />
                    <span className="site-ship-cookbook-dot site-ship-cookbook-dot-accent" />
                  </span>
                </span>
              </span>
            }
          >
            <Button href={SPOONJOY_KITCHEN}>{spoonjoy.open}</Button>
            <Button href={`${SPOONJOY_KITCHEN}?xray`} variant="outline" tone="secondary" aria-describedby="ship-spoonjoy-title">
              {spoonjoy.xray}
            </Button>
            <a href={SPOONJOY_SOURCE} className="site-quiet-link">
              {spoonjoy.source}
            </a>
          </ShipCard>
        </div>
      </Container>
    </section>
  );
}
