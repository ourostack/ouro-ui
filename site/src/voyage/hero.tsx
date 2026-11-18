import type { JSX } from "react";
import proof from "virtual:site-proof";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { keepClearOfToasts } from "./clear-of-toasts";
import { HANDOFF, KIT, TRY, VOYAGE_HERO } from "../copy";
import { GITHUB, href } from "../paths";
import { HydrateInTurn } from "../hydrate";
import { latestRelease } from "../latest-release";
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
 * The headline's phrases ("Delightful interfaces,", "by agents,", "for everyone.") each stay on one line, so it breaks
 * only between them, never after "by".
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

/** The release the hand-off's prompt brings in, beside it, linking to that release's notes. */
export const RELEASE_HREF = `${GITHUB}/releases/tag/${latestRelease}`;

function CopyIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 4.5A1.5 1.5 0 0 0 11.5 3H5a2 2 0 0 0-2 2v6.5A1.5 1.5 0 0 0 4.5 13" />
    </svg>
  );
}

/**
 * What a person does here: hand Ouro UI to their coding agent, as one line to paste, with Copy beside it. The agent
 * installs; the commands wait in the install section, which the caption points to.
 */
function HandOff(): JSX.Element {
  return (
    <div className="site-install-block site-handoff" role="group" aria-labelledby="site-handoff-label" data-site-handoff="">
      <div className="site-handoff-head">
        <p id="site-handoff-label" className="site-handoff-label">
          {HANDOFF.label}
        </p>
        <Badge href={RELEASE_HREF} tone="primary" variant="soft" data-site-release="">
          {`${latestRelease} · latest release`}
        </Badge>
      </div>
      <div className="site-install">
        <p className="site-handoff-prompt" data-site-handoff-prompt="">
          {HANDOFF.prompt}
        </p>
        <Button
          variant="soft"
          tone="secondary"
          size="sm"
          className="site-install-copy"
          onClick={(event) => {
            const block = event.currentTarget.closest(".site-install-block");
            void navigator.clipboard.writeText(HANDOFF.prompt).then(
              () => toast(HANDOFF.copied, { tone: "success" }),
              () => toast("The browser blocked the clipboard", { tone: "destructive", description: "Select the line and copy it yourself." }),
            ).then(() => keepClearOfToasts(block));
          }}
        >
          <CopyIcon />
          Copy
        </Button>
      </div>
      <p className="site-install-caption" data-site-handoff-caption="">
        {HANDOFF.caption}{" "}
        <span className="site-install-more">
          <Link href={HANDOFF.commands.href} tone="secondary" inline>
            {HANDOFF.commands.text}
          </Link>
        </span>
      </p>
    </div>
  );
}

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
 * What is in the kit, in one row under the hero: four parts, each named for who it serves, with a hairline above each
 * (no cards). Four across on a wide screen, two on a tablet, one under another on a phone.
 */
function Kit(): JSX.Element {
  return (
    <section aria-labelledby="site-kit-title" className="site-kit" data-site-kit="">
      <Container>
        <h2 id="site-kit-title" className="site-kit-title">
          {KIT.title}
        </h2>
        <ul className="site-kit-list">
          {KIT.items.map((item) => (
            <li key={item.key} className="site-kit-item" data-site-kit-item={item.key}>
              <p className="site-kit-name">{item.name}</p>
              <h3 className="site-kit-heading">
                <Link href={href(item.href)} tone="secondary" inline>
                  {item.title}
                </Link>
              </h3>
              <p className="site-kit-line">{item.line}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
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
            {keepPhrasesWhole(part)}
            {index < VOYAGE_HERO.title.length - 1 ? " " : null}
          </span>
        ))}
        description={
          <>
            <p>{keepHyphenatedWordsWhole(VOYAGE_HERO.subline)}</p>
            <p className="site-hero-links" data-site-hero-links="">
              {[VOYAGE_HERO.links.benchmark, VOYAGE_HERO.links.reviews, VOYAGE_HERO.links.platforms].map((link) => (
                <Link key={link.href} href={href(link.href)} tone="secondary" inline>
                  {link.label}
                </Link>
              ))}
            </p>
          </>
        }
        mediaWidth={1536}
        children={
          <div className="site-hero-side" data-site-hero-side="">
            {/* Feel it: a look repaints the whole page, there and then. Live, the default, follows the reader's sky. */}
            <div className="site-hero-paint" data-site-hero-paint="">
              <p className="site-hero-paint-label">Try a look. The whole page changes with it.</p>
              <ThemeDots label="Theme" nameClassName="max-sm:hidden" groupClassName="site-hero-dots" />
            </div>
            <HandOff />
          </div>
        }
        media={<StoryWorld scene="ouro-hx" sizes={HERO_SCENE_SIZES} className="site-voyage-scene" />}
      />
      <Kit />
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
