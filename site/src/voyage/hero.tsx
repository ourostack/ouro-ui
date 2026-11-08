import type { JSX } from "react";
import proof, { install } from "virtual:site-proof";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
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
 * half: after the stage on a phone, so the first screen keeps the porthole; on a wide screen, in the copy's column
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

/** The first viewport: Ouro's meadow with the headline in its sky, then how to add HX, beside the porthole stage. */
export function Hero({ onXray }: { onXray: () => void }): JSX.Element {
  return (
    <section aria-labelledby="hero-title" className="site-hero site-hero-storybook">
      {/*
        The arrival: the page opens in Ouro's meadow at dawn (the storybook world, storybook.ts), the
        headline in its sky; the porthole, the showcase, follows. The eyebrow names Ouro UI's two halves (the
        header names Ouro UI itself); on a phone the halves are named under the stage, so it stays for screen readers only.
      */}
      <StoryWorld scene="ouro-hx">
        <Container>
          <p className="site-eyebrow site-hero-eyebrow max-sm:sr-only" data-site-eyebrow="">
            <span className="site-hero-brand">{EYEBROW}</span>
          </p>
          <h1 id="hero-title" className="site-h1 site-hero-title mt-1 sm:mt-3 lg:mt-4">
            {VOYAGE_HERO.title.map((sentence, index) => (
              <span key={sentence} className={index === 0 ? "site-hero-line" : "site-hero-line site-hero-line-second"}>
                {sentence}
                {index < VOYAGE_HERO.title.length - 1 ? " " : null}
              </span>
            ))}
          </h1>
        </Container>
      </StoryWorld>
      <Container className="site-hero-grid">
        <div className="site-hero-copy">
          {/* On a phone the theme dots open the copy, above the words, so the stage's first control comes sooner. */}
          <div className="max-sm:flex max-sm:flex-col">
            <p className="site-lede max-w-[44ch] max-sm:mt-2">{VOYAGE_HERO.subline}</p>
            <div className="mt-3 max-w-[36rem] lg:mt-7">
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
        <div className="site-hero-stage">
          <HydrateInTurn name="stage">
            <Stage onXray={onXray} />
          </HydrateInTurn>
        </div>
        <Halves />
        {/* After the stage on a phone; on a wide screen, at the foot of the copy, level with the console's. */}
        <Proof />
      </Container>
    </section>
  );
}
