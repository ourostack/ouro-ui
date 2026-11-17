import type { JSX } from "react";
import proof from "virtual:site-proof";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { keepClearOfToasts } from "./clear-of-toasts";
import { HALVES, HANDOFF, VOYAGE_HERO } from "../copy";
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
 * Ouro UI's two halves, HX and AX, under a line that says so, as two hairline rows (no cards), each name a link to its
 * half: after the stage on a phone, so they don't push the porthole further down; on a wide screen, in the copy's column
 * between the paint and the proof.
 */
function Halves(): JSX.Element {
  const rows = [
    { key: "hx", ...HALVES.hx },
    { key: "ax", ...HALVES.ax },
  ] as const;
  return (
    <div role="group" aria-labelledby="site-halves-title" className="site-halves" data-site-halves="">
      <p id="site-halves-title" className="site-halves-title">
        {HALVES.title}
      </p>
      <dl className="site-halves-list">
        {rows.map((row) => (
          <div key={row.key} className="site-halves-row" data-site-half={row.key}>
            <dt className="site-halves-name">
              <span className="site-halves-mark" aria-hidden="true">
                {row.key.toUpperCase()}
              </span>
              <span>
                <Link href={href(row.href)} tone="secondary" inline>
                  {row.name}
                </Link>{" "}
                <span className="site-halves-expansion">· {row.expansion}</span>
              </span>
            </dt>
            <dd className="site-halves-line">{row.line}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The first viewport: Ouro's meadow with the headline above it, then how to add HX and the porthole stage beneath it. */
export function VoyageHero({ onXray }: { onXray: () => void }): JSX.Element {
  return (
    <>
      {/*
        The arrival: the page opens in Ouro's meadow at dawn (the storybook world, storybook.ts), the headline above
        it, never drawn wider than the 1536px scene file. The eyebrow names Ouro UI's two halves (the header names Ouro UI
        itself); on a phone the halves are named under the stage, so it stays for screen readers only.
      */}
      <Hero
        layout="stage"
        className="site-voyage-hero"
        eyebrow={
          <span className="site-hero-brand" data-site-eyebrow="">
            {EYEBROW}
          </span>
        }
        title={VOYAGE_HERO.title.map((sentence, index) => (
          <span key={sentence} className={index === 0 ? undefined : "site-hero-line-second"}>
            {sentence}
            {index < VOYAGE_HERO.title.length - 1 ? " " : null}
          </span>
        ))}
        description={
          <>
            <p className="sm:hidden" data-site-hero-phone="">
              {VOYAGE_HERO.phoneSubline} See the{" "}
              <Link href={href(VOYAGE_HERO.links.benchmark.href)} tone="secondary" inline>
                agent benchmark
              </Link>{" "}
              and the{" "}
              <Link href={href(VOYAGE_HERO.links.reviews.href)} tone="secondary" inline>
                model reviews
              </Link>
              .
            </p>
            <p className="mx-auto max-w-[44rem] max-sm:hidden">{keepHyphenatedWordsWhole(VOYAGE_HERO.subline)}</p>
            <p className="site-hero-links mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-base max-sm:hidden" data-site-hero-links="">
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
          // The one thing a person does here, on the first screen, before the art: hand Ouro UI to their agent.
          <div className="site-hero-handoff mx-auto mt-6 grid w-full max-w-[36rem] gap-8 text-start max-sm:gap-6">
            {/* Feel it first: a look repaints the whole page, there and then. */}
            <div className="site-hero-paint text-center" data-site-hero-paint="">
              <p className="mb-3 text-sm text-muted-foreground">Try a look. The whole page changes with it.</p>
              <ThemeDots label="Theme" nameClassName="max-sm:hidden" groupClassName="justify-center max-sm:justify-between" />
            </div>
            <HandOff />
          </div>
        }
        media={<StoryWorld scene="ouro-hx" sizes={HERO_SCENE_SIZES} className="site-voyage-scene" />}
      />
      <section aria-label="Try the porthole" className="site-console">
        <Container className="site-console-grid">
          <div className="site-console-copy">
            {/*
              Having tried a look and handed Ouro UI over (in the hero), a newcomer plays: the porthole beside it, the
              Nautilus's story or the components. The commands wait in the install section.
            */}
            <div className="flex flex-col">
              <div className="flex flex-wrap gap-3">
                <Button href={href("/nautilus/")} size="lg">
                  Come aboard
                </Button>
                <Button href={href("/docs/")} variant="outline" tone="secondary" size="lg">
                  Browse components
                </Button>
              </div>
            </div>
          </div>
          <div className="site-console-stage">
            <HydrateInTurn name="stage">
              <Stage onXray={onXray} />
            </HydrateInTurn>
          </div>
          <Halves />
          <Proof />
        </Container>
      </section>
    </>
  );
}
