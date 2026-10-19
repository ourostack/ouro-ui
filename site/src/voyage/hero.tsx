import type { JSX } from "react";
import proof from "virtual:site-proof";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { HERO_SUBLINE, HERO_TITLE } from "../copy";
import { href } from "../paths";
import { latestRelease } from "../latest-release";
import { Container } from "./layout";
import { Stage } from "./stage/stage";

/** The install line the hero offers: one component, at the newest release. */
export const INSTALL_COMMAND = `npx shadcn@latest add ourostack/ouro-ui/checklist#${latestRelease}`;

export const MOTTO_TOOLTIP = "Moving within the moving element. Captain Nemo's motto.";

function CopyIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 4.5A1.5 1.5 0 0 0 11.5 3H5a2 2 0 0 0-2 2v6.5A1.5 1.5 0 0 0 4.5 13" />
    </svg>
  );
}

/** The install command in a box that scrolls on a phone, with Copy and a toast. */
function Install(): JSX.Element {
  return (
    <div className="site-install flex min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-card py-1.5 ps-4 pe-1.5 shadow-(--shadow-xs)">
      <span aria-hidden="true" className="site-mono select-none text-muted-foreground">
        $
      </span>
      <code tabIndex={0} className="site-mono min-w-0 flex-1 overflow-x-auto py-2 whitespace-nowrap text-foreground outline-ring focus-visible:outline-2" data-site-install="">
        {INSTALL_COMMAND}
      </code>
      <Button
        variant="plain"
        tone="secondary"
        size="sm"
        aria-label="Copy the install command"
        className="shrink-0 px-2"
        onClick={() => {
          void navigator.clipboard.writeText(INSTALL_COMMAND).then(
            () => toast("Copied the install command", { tone: "success", description: "Paste it in your app's folder. It adds Checklist." }),
            () => toast("Couldn't copy", { tone: "destructive", description: "Select the command and copy it yourself." }),
          );
        }}
      >
        <CopyIcon />
      </Button>
    </div>
  );
}

/** The first viewport: the promise and the install line beside the porthole stage. */
export function Hero({ onXray }: { onXray: () => void }): JSX.Element {
  return (
    <section aria-labelledby="hero-title" className="pt-8 pb-16 lg:pt-6 lg:pb-16">
      <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-8 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
        <div className="order-1 lg:order-none lg:col-span-5 lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="site-eyebrow flex flex-wrap items-center gap-x-1.5">
            <Tooltip content={MOTTO_TOOLTIP} side="bottom" align="start">
              <Button variant="plain" tone="secondary" size="sm" className="h-auto min-h-0 px-0 py-0.5" data-site-motto="">
                <span className="site-eyebrow site-motto">Mobilis in mobili</span>
              </Button>
            </Tooltip>
            <span aria-hidden="true">·</span>
            <span>Ouro HX</span>
          </p>
          <h1 id="hero-title" className="site-h1 mt-4 max-w-[15ch]">
            {HERO_TITLE}
          </h1>
          <p className="site-lede mt-6 max-w-[40ch]">{HERO_SUBLINE}</p>
          <div className="mt-6 max-w-[34rem] lg:mt-8">
            <Install />
          </div>
        </div>
        <div className="order-3 lg:order-none lg:col-span-5 lg:col-start-1 lg:row-start-2">
          <div className="flex flex-wrap gap-3">
            <Button href={href("/docs/installing/")} size="lg">
              Come aboard
            </Button>
            <Button variant="outline" tone="secondary" size="lg" onClick={onXray} data-site-xray-cta="">
              See how it&rsquo;s built
            </Button>
          </div>
          <p className="mt-6 mb-0 max-w-[34rem] text-sm text-muted-foreground" data-site-proof="">
            {proof.line}
          </p>
        </div>
        <div className="order-2 lg:order-none lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
          <Stage />
        </div>
      </Container>
    </section>
  );
}
