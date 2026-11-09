import type { JSX, ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { TWO_SHIPS } from "./copy";
import { href } from "../paths";
import { Container } from "./layout";
import { art } from "./stage/art";
import { StoryWorld } from "../components/story-world";
import images from "../../public/showcase/images.json";

const SPOONJOY_KITCHEN = "https://spoonjoy.app/test-kitchen";
const SPOONJOY_SOURCE = "https://github.com/spoonjoy/spoonjoy-v2";
/** Ouro's one public home. */
const OURO_HOME = "https://ouroboros.bot/";

/** The Nautilus in profile, the stage's own drawing, coloured from the theme (stage.css); its one id renamed so the page has it once. */
const SHIP = art.nautilus.inner.replaceAll("nautilus-sheen", "ship-card-sheen");

/** One showcase: open text on the page under a hairline, no card around it, and its picture beside it. */
/** A showcase row: its words, then its art beside them, or, when `wide`, under them across the row. */
function Showcase({ id, title, body, art, wide = false, children }: { id: string; title: string; body: string; art: ReactNode; wide?: boolean; children: ReactNode }): JSX.Element {
  return (
    <article
      aria-labelledby={`${id}-title`}
      className="site-ship grid items-center gap-x-12 gap-y-6 border-t border-border pt-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      data-site-ship={id}
    >
      <div className="grid content-start gap-4">
        <h3 id={`${id}-title`} className="site-h3">
          {title}
        </h3>
        <p className="m-0 max-w-[46ch] text-muted-foreground" id={`${id}-body`}>
          {body}
        </p>
        <div className="flex flex-wrap items-center gap-3">{children}</div>
      </div>
      {wide ? <div className="md:col-span-2">{art}</div> : art}
    </article>
  );
}

const shots = images as Record<string, { width: number; height: number; src: string; sources: { type: string; srcset: string }[] }>;

/** Below the `sm` breakpoint the row is a phone's width, so it shows the phone capture, not the wide one shrunk to a strip. */
const PHONE = "(max-width: 639.98px)";

/**
 * One theme's X-ray screenshot, AVIF then WebP at each width (site/public/showcase/images.json, made by Ouro images):
 * Spoonjoy at a phone's width on a phone, at a laptop's elsewhere.
 */
function Shot({ theme, className }: { theme: "light" | "dark"; className: string }): JSX.Element {
  const shot = shots[`spoonjoy-xray-${theme}.webp`]!;
  const phone = shots[`spoonjoy-xray-phone-${theme}.webp`]!;
  const url = (path: string) => href(path);
  const srcSet = (srcset: string) => srcset.replace(/(^|, )\//g, (_, lead: string) => `${lead}${url("/")}`);
  // The row's width: the page's 79rem column less its 2rem gutters, which grow with the root type on a 4K screen (styles.css).
  const sizes = "(min-width: 200rem) 1500px, (min-width: 150rem) 1350px, (min-width: 79rem) 1200px, calc(100vw - 4rem)";
  return (
    <picture className={className}>
      {phone.sources.map((source) => (
        <source key={`phone-${source.type}`} media={PHONE} type={source.type} srcSet={srcSet(source.srcset)} sizes="100vw" width={phone.width} height={phone.height} />
      ))}
      {shot.sources.map((source) => (
        <source key={source.type} type={source.type} srcSet={srcSet(source.srcset)} sizes={sizes} />
      ))}
      <img
        src={url(shot.src)}
        width={shot.width}
        height={shot.height}
        alt={TWO_SHIPS.spoonjoy.shot.alt[theme]}
        loading="lazy"
        decoding="async"
        className="site-ship-shot-img"
      />
    </picture>
  );
}

/** "Two ships, same parts.": two showcases of Ouro HX, the Nautilus (made up to show it off) and Spoonjoy (a real app). */
export function TwoShips(): JSX.Element {
  const { nautilus, spoonjoy } = TWO_SHIPS;
  return (
    <section aria-labelledby="ships-title" id="ships" className="pt-20 lg:pt-28">
      <Container>
        <p className="site-eyebrow">{TWO_SHIPS.eyebrow}</p>
        <h2 id="ships-title" className="site-h2 mt-4">
          {TWO_SHIPS.title}
        </h2>
        <p className="site-lede mt-5 mb-0 max-w-[44ch]">{TWO_SHIPS.intro}</p>
        <div className="mt-12 grid gap-y-14 lg:mt-16 lg:gap-y-20">
          <Showcase
            id="ship-nautilus"
            title={nautilus.title}
            body={nautilus.body}
            art={<svg aria-hidden="true" viewBox={art.nautilus.viewBox} className="site-ship-nautilus" dangerouslySetInnerHTML={{ __html: SHIP }} />}
          >
            <Button href={href("/nautilus/")}>{nautilus.open}</Button>
            <Button href={href("/nautilus/?xray")} variant="outline" tone="secondary" aria-describedby="ship-nautilus-title">
              {nautilus.xray}
            </Button>
          </Showcase>
          <Showcase
            id="ship-spoonjoy"
            title={spoonjoy.title}
            body={spoonjoy.body}
            wide
            art={
              <figure className="site-ship-shot m-0 grid gap-3">
                <Shot theme="light" className="site-ship-shot-light" />
                <Shot theme="dark" className="site-ship-shot-dark" />
                <figcaption id="ship-spoonjoy-caption" className="text-sm text-muted-foreground">
                  {spoonjoy.shot.caption}
                </figcaption>
              </figure>
            }
          >
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
      {/* Past the two showcases, the rest of Ouro's world: Ouro UI is one corner of it. */}
      <StoryWorld scene="ourostack" variant="band" className="mt-16 lg:mt-24">
        <Container>
          <p className="story-world-line" data-story-line="">
            Ouro UI is one corner of Ouro's meadow. There's a desk, a toy factory and a picnic going on just over the hill.
          </p>
          <p className="mt-3 mb-0">
            <a href={OURO_HOME} className="story-world-link font-medium">
              Meet the neighbours
            </a>
          </p>
        </Container>
      </StoryWorld>
    </section>
  );
}
