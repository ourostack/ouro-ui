import type { JSX } from "react";
import proof, { install } from "virtual:site-proof";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { keepClearOfToasts } from "./clear-of-toasts";
import { HALVES, VOYAGE_HERO } from "../copy";
import { GITHUB, href } from "../paths";
import { HydrateInTurn } from "../hydrate";
import { latestRelease } from "../latest-release";
import { Container } from "./layout";
import { StoryWorld } from "../components/story-world";
import { Stage } from "./stage/stage";
import { ThemeDots } from "./theme-dots";

/** The hero scene's width: Hero's stage width (its 80rem cap, scaled by the root type on a wide screen), never past the 1536px file width. In rem, so a larger browser font never makes it guess too small. */
const HERO_SCENE_SIZES = "(min-width: 200rem) min(1536px, 100rem), (min-width: 150rem) min(1536px, 90rem), (min-width: 80rem) min(1536px, 80rem), calc(100vw - 4rem)";

/** What the hero says the library is, before anything else: its name. */
export const EYEBROW = VOYAGE_HERO.eyebrow;

/**
 * The install line, whole and pinned: one component that is in the latest release (proof.mts picks
 * it from that release's registry.json), at that release, so what you copy is what you read.
 */
export const INSTALL_COMMAND = `npx shadcn@latest add ourostack/ouro-ui/${install.item}#${latestRelease}`;

const title = (item: string) => item.charAt(0).toUpperCase() + item.slice(1);

/**
 * Under the command: how it installs, and that it adds that one component, so nobody thinks it
 * installs the whole library. No count: the home page sells what the kit does, not how many parts
 * it has (Ari, 2026-10-30).
 */
export const INSTALL_CAPTION = `Adds ${title(install.item)}. Any other part installs the same way.`;
const [INSTALL_HOW, INSTALL_MORE] = [INSTALL_CAPTION.slice(0, INSTALL_CAPTION.indexOf(". ") + 1), INSTALL_CAPTION.slice(INSTALL_CAPTION.indexOf(". ") + 2)];

/** The release the command pins, beside it, linking to that release's notes. */
export const RELEASE_HREF = `${GITHUB}/releases/tag/${latestRelease}`;

function CopyIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 4.5A1.5 1.5 0 0 0 11.5 3H5a2 2 0 0 0-2 2v6.5A1.5 1.5 0 0 0 4.5 13" />
    </svg>
  );
}

/** Where the command may wrap on a narrow screen: after "add", and after each slash of the address. */
function CommandText(): JSX.Element {
  const [run, address] = INSTALL_COMMAND.split(" add ") as [string, string];
  const parts = address.split("/");
  return (
    <>
      <span className="site-install-run">{run} add</span>{" "}
      <span className="site-install-address">
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < parts.length - 1 ? (
              <>
                /<wbr />
              </>
            ) : null}
          </span>
        ))}
      </span>
    </>
  );
}

/**
 * The install command, whole at every width: on one line where it fits, on two (the run, then the
 * address) where it doesn't, never cut off or scrolled. Copy sits beside it.
 */
function Install(): JSX.Element {
  return (
    <div className="site-install-block">
      <div className="site-install">
        <span aria-hidden="true" className="site-mono site-install-prompt">
          $
        </span>
        <code className="site-mono site-install-command" data-site-install="">
          <CommandText />
        </code>
        <Button
          variant="soft"
          tone="secondary"
          size="sm"
          className="site-install-copy"
          onClick={(event) => {
            const block = event.currentTarget.closest(".site-install-block");
            void navigator.clipboard.writeText(INSTALL_COMMAND).then(
              () => toast("Copied the install command", { tone: "success", description: `Run it in your app's folder. It adds ${title(install.item)}.` }),
              () => toast("The browser blocked the clipboard", { tone: "destructive", description: "Select the command and copy it yourself." }),
            ).then(() => keepClearOfToasts(block));
          }}
        >
          <CopyIcon />
          Copy
        </Button>
      </div>
      <div className="site-install-foot">
        <p className="site-install-caption" data-site-install-caption="">
          {INSTALL_HOW} <span className="site-install-more">{INSTALL_MORE}</span>
        </p>
        <Badge href={RELEASE_HREF} tone="primary" variant="soft" data-site-release="">
          {`${latestRelease} · latest release`}
        </Badge>
      </div>
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

/** The first viewport: Ouro's meadow with the headline in its sky, then how to add HX and the porthole stage beneath it. */
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
          <span key={sentence} className={index === 0 ? "site-hero-line" : "site-hero-line site-hero-line-second"}>
            {sentence}
            {index < VOYAGE_HERO.title.length - 1 ? " " : null}
          </span>
        ))}
        description={VOYAGE_HERO.subline}
        mediaWidth={1536}
        media={<StoryWorld scene="ouro-hx" sizes={HERO_SCENE_SIZES} className="site-voyage-scene" />}
      />
      <section aria-label="Install and try the porthole" className="site-console">
        <Container className="site-console-grid">
          <div className="site-console-copy">
            {/* On a phone the theme dots open the copy, above the words, so the stage's first control comes sooner. */}
            <div className="max-sm:flex max-sm:flex-col">
              <div className="max-w-[36rem]">
                <Install />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 lg:mt-6">
                <Button href={href("/nautilus/")} size="lg">
                  Come aboard
                </Button>
                <Button href={href("/docs/")} variant="outline" tone="secondary" size="lg">
                  Browse components
                </Button>
              </div>
              <div className="mt-6 max-sm:order-first max-sm:mt-0 lg:mt-9">
                <p className="mb-2.5 text-sm text-muted-foreground max-sm:sr-only">Pick a coat of paint. The whole page changes with it.</p>
                <ThemeDots label="Theme" nameClassName="max-sm:hidden" />
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
