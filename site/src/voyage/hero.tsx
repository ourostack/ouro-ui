import { Suspense, useEffect, useRef, useState, type JSX, type ReactElement } from "react";
import proof, { install } from "virtual:site-proof";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import type { Tooltip as TooltipComponent } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { keepClearOfToasts } from "./clear-of-toasts";
import { VOYAGE_HERO } from "../copy";
import { GITHUB, href } from "../paths";
import { latestRelease } from "../latest-release";
import { Container } from "./layout";
import { Stage } from "./stage/stage";

/** What the hero says the library is, before anything else: HX, and that it is under construction. */
export const EYEBROW = VOYAGE_HERO.eyebrow;

/**
 * The install line, whole and pinned: one component that is in the latest release (proof.mts picks
 * it from that release's registry.json), at that release, so what you copy is what you read.
 */
export const INSTALL_COMMAND = `npx shadcn@latest add ourostack/ouro-ui/${install.item}#${latestRelease}`;

const title = (item: string) => item.charAt(0).toUpperCase() + item.slice(1);

/**
 * Under the command: how it installs, and that it adds one component of many, so nobody thinks it
 * installs the whole library. The count is the release's (proof.mts), never typed in.
 */
export const INSTALL_CAPTION = `Installs with the shadcn CLI. ${title(install.item)} is one of ${install.count}.`;
const [INSTALL_HOW, INSTALL_COUNT] = [INSTALL_CAPTION.slice(0, INSTALL_CAPTION.indexOf(". ") + 1), INSTALL_CAPTION.slice(INSTALL_CAPTION.indexOf(". ") + 2)];

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
 * address) where it doesn't, never cut off or scrolled. The release it pins and Copy sit in the bar
 * beside it.
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
        <Badge href={RELEASE_HREF} tone="primary" variant="soft" className="site-install-release" data-site-release="">
          {latestRelease}
          <span className="site-install-release-word"> · latest release</span>
        </Badge>
        <Button
          variant="soft"
          tone="secondary"
          size="sm"
          className="site-install-copy"
          onClick={(event) => {
            const block = event.currentTarget.closest(".site-install-block");
            void navigator.clipboard.writeText(INSTALL_COMMAND).then(
              () => toast("Copied the install command", { tone: "success", description: `Run it in your app's folder. It adds ${title(install.item)}.` }),
              () => toast("Couldn't copy", { tone: "destructive", description: "Select the command and copy it yourself." }),
            ).then(() => keepClearOfToasts(block));
          }}
        >
          <CopyIcon />
          Copy
        </Button>
      </div>
      <div className="site-install-foot">
        <p className="site-install-caption" data-site-install-caption="">
          {INSTALL_HOW} <span className="site-install-count">{INSTALL_COUNT}</span>
        </p>
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

/**
 * A proof link's Tooltip once its code has come, and the bare link until then: the same element in
 * the row either way. Under the Tooltip the link is a new element, so a link that has focus as the
 * code comes stays bare, and keeps that focus, until it loses it.
 */
function Tip({ Tooltip, held, content, children }: { Tooltip: typeof TooltipComponent | null; held: boolean; content: string; children: ReactElement }): JSX.Element {
  return Tooltip && !held ? (
    <Tooltip content={content} side="bottom" align="start">
      {children}
    </Tooltip>
  ) : (
    children
  );
}

/**
 * The proof: each claim, computed from the repository, links to where you can check it, and says
 * where that is on hover and focus (HX Tooltip; Escape closes it) and to screen readers (the link's
 * description). The Tooltip's code is not in the page's first load: it comes once the pointer or
 * focus is in the hero, on its way to a link.
 */
function Proof(): JSX.Element {
  const list = useRef<HTMLUListElement>(null);
  const [Tooltip, setTooltip] = useState<typeof TooltipComponent | null>(null);
  // The link that had focus when the Tooltip's code came: it stays bare until it loses focus.
  const [held, setHeld] = useState(-1);
  useEffect(() => {
    const listening = new AbortController();
    const load = () => {
      listening.abort();
      void import("@/registry/ouro/components/ouro/tooltip/tooltip").then((module) => {
        // Gone already: the hero left the page before the code came.
        if (!list.current) return;
        setHeld([...list.current.querySelectorAll("a")].indexOf(document.activeElement as HTMLAnchorElement));
        setTooltip(() => module.Tooltip);
      });
    };
    const hero = list.current!.closest("section")!;
    hero.addEventListener("pointerover", load, listening);
    hero.addEventListener("focusin", load, listening);
    return () => listening.abort();
  }, []);
  return (
    <ul ref={list} className="site-proof" aria-label="What we test" data-site-proof="" data-site-proof-tips={Tooltip ? "" : undefined}>
      {proof.claims.map((claim, index) => (
        <li key={claim.text}>
          <CheckIcon />
          <Tip Tooltip={Tooltip} held={index === held} content={claim.where}>
            <Link href={claim.href} tone="secondary" inline aria-describedby={`site-proof-where-${index}`} onBlur={index === held ? () => setHeld(-1) : undefined}>
              {claim.text}
            </Link>
          </Tip>
          <span className="site-proof-where" id={`site-proof-where-${index}`}>
            {claim.where}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The first viewport: what HX is and how to add it, beside the porthole stage. */
export function Hero({ onXray }: { onXray: () => void }): JSX.Element {
  return (
    <section aria-labelledby="hero-title" className="site-hero">
      <Container className="site-hero-grid">
        <div className="site-hero-copy">
          <div>
            <p className="site-eyebrow site-hero-eyebrow" data-site-eyebrow="">
              <span className="site-hero-brand">{EYEBROW.split(" · ")[0]}</span>
              <span className="sr-only"> · </span>
              <span className="site-hero-status">{EYEBROW.split(" · ")[1]}</span>
            </p>
            <h1 id="hero-title" className="site-h1 site-hero-title mt-2 sm:mt-3 lg:mt-5">
              {VOYAGE_HERO.title.map((sentence, index) => (
                <span key={sentence} className={index === 0 ? "site-hero-line" : "site-hero-line site-hero-line-second"}>
                  {sentence}
                  {index < VOYAGE_HERO.title.length - 1 ? " " : null}
                </span>
              ))}
            </h1>
            <p className="site-lede mt-2 max-w-[44ch] sm:mt-3 lg:mt-5">{VOYAGE_HERO.subline}</p>
            <div className="mt-3 max-w-[36rem] lg:mt-7">
              <Install />
            </div>
            <div className="mt-3 flex flex-wrap gap-3 lg:mt-6">
              <Button href={href("/docs/installing/")} size="lg">
                Come aboard
              </Button>
              <Button href={href("/docs/")} variant="outline" tone="secondary" size="lg">
                Browse components
              </Button>
            </div>
          </div>
        </div>
        <div className="site-hero-stage">
          <Suspense>
            <Stage onXray={onXray} />
          </Suspense>
        </div>
        {/* After the stage on a phone; on a wide screen, at the foot of the copy, level with the console's. */}
        <Proof />
      </Container>
    </section>
  );
}
