import type { JSX } from "react";
import proof from "virtual:site-proof";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { TRY, VOYAGE_HERO } from "../copy";
import { HandOff } from "./handoff";
import { Why } from "./home-sections";
import { href } from "../paths";
import { HydrateInTurn } from "../hydrate";
import { Container } from "./layout";
import { StoryWorld } from "../components/story-world";
import { Stage } from "./stage/stage";
import { ThemeDots } from "./theme-dots";

/** A line never breaks inside a hyphenated word ("X-ray", "person-only"): each sits in a no-wrap span. */
function keepHyphenatedWordsWhole(text: string): (string | JSX.Element)[] {
  return text.split(/(\S+-\S+)/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="whitespace-nowrap" data-site-whole-word="">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/**
 * The second half's phrases ("by agents,", "for everyone.") each stay on one line, so the headline never breaks after
 * "by". The first half may still wrap, so it fits the narrowest column.
 */
function keepPhrasesWhole(text: string): (string | JSX.Element)[] {
  return text.split(/(?<=,) /).flatMap((phrase, index) => [
    ...(index > 0 ? [" "] : []),
    <span key={index} className="whitespace-nowrap" data-site-phrase="">
      {phrase}
    </span>,
  ]);
}

/** The hero scene's width: Hero's stage width (its 80rem cap, scaled by the root type on a wide screen), never past the 1536px file width. In rem, so a larger browser font never makes it guess too small. */
const HERO_SCENE_SIZES = "(min-width: 200rem) min(1536px, 100rem), (min-width: 150rem) min(1536px, 90rem), (min-width: 80rem) min(1536px, 80rem), calc(100vw - 4rem)";

/** What the hero says the library is, before anything else: its name. */
export const EYEBROW = VOYAGE_HERO.eyebrow;

export { RELEASE_HREF } from "./handoff";

function CheckIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="site-proof-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** The proof: each claim, computed from the repository, links to where you can check it. */
function Proof(): JSX.Element {
  return (
    <ul className="site-proof" aria-label="What you can count on" data-site-proof="">
      {proof.claims.map((claim) => (
        <li key={claim.text}>
          <CheckIcon />
          <Link href={claim.href} tone="secondary" inline>
            {claim.text}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The first viewport. On a wide screen the story and the hand-off share one row, the story beside the things to do, and
 * the meadow runs the full width under them, so it is on the first screen too. Below that the meadow comes straight after
 * the lede, before the look and the hand-off (voyage.css).
 */
export function VoyageHero({ onXray }: { onXray: () => void }): JSX.Element {
  return (
    <>
      <Hero
        layout="stage"
        className="site-voyage-hero"
        eyebrow={
          <span className="site-hero-brand" data-site-eyebrow="">
            {EYEBROW}
          </span>
        }
        title={VOYAGE_HERO.title.map((part, index) => (
          <span key={part} className={index === 0 ? undefined : "site-hero-line-second"}>
            {index === 0 ? part : keepPhrasesWhole(part)}
            {index < VOYAGE_HERO.title.length - 1 ? " " : null}
          </span>
        ))}
        description={
          <>
            <p>{keepHyphenatedWordsWhole(VOYAGE_HERO.subline)}</p>
            <nav aria-label="Platforms" className="site-hero-links" data-site-hero-links="">
              {VOYAGE_HERO.platforms.map((platform, index) => (
                <span key={platform.href}>
                  {index > 0 ? (
                    <span aria-hidden="true" className="site-hero-dot">
                      ·
                    </span>
                  ) : null}
                  <Link href={href(platform.href)} tone="secondary" inline>
                    {platform.label}
                  </Link>
                </span>
              ))}
            </nav>
          </>
        }
        mediaWidth={1536}
        children={
          <div className="site-hero-side" data-site-hero-side="">
            {/* Feel it: a look repaints the whole page, there and then. Live, the default, follows the reader's sky. */}
            <div className="site-hero-paint" data-site-hero-paint="">
              <p className="site-hero-paint-label">Try a look: it changes this page's colours, headline font and corner roundness.</p>
              <ThemeDots label="Theme" nameClassName="max-sm:hidden" className="site-hero-dots" />
            </div>
            <HandOff />
          </div>
        }
        media={<StoryWorld scene="ouro-hx" sizes={HERO_SCENE_SIZES} className="site-voyage-scene" />}
      />
      <Why />
      <section aria-label="Try the porthole" className="site-console">
        <Container className="site-console-grid">
          <div className="site-console-copy" data-site-try="">
            <h2 className="site-try-title">{TRY.title}</h2>
            <p className="site-try-lede">{TRY.lede}</p>
            <div className="flex flex-wrap gap-3">
              <Button href={href("/nautilus/")} size="lg">
                Come aboard
              </Button>
              <Button href={href("/docs/")} variant="outline" tone="secondary" size="lg">
                Browse components
              </Button>
            </div>
          </div>
          <div className="site-console-stage">
            <HydrateInTurn name="stage">
              <Stage onXray={onXray} />
            </HydrateInTurn>
          </div>
          <Proof />
        </Container>
      </section>
    </>
  );
}
