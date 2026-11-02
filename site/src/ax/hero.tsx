import type { JSX, ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { href } from "../paths";
import { Container } from "../voyage/layout";

/**
 * The Ouro AX page's hero: its heading and words come with the voyage page, so the page has its title at once; the
 * exhibit beside them (exhibit.tsx), one moment as the person and the agent see it, is an island.
 */
export function AxHero({ exhibit }: { exhibit: ReactNode }): JSX.Element {
  return (
    <section aria-labelledby="ax-title" className="site-hero ax-hero">
      <Container className="ax-hero-grid grid items-center gap-x-12 gap-y-10">
        <div className="grid content-start gap-5">
          <p className="site-eyebrow">Ouro AX</p>
          <h1 id="ax-title" className="site-h1">
            A morning with an agent
          </h1>
          <p className="site-lede">
            Ouro HX is for the screens people use. Ouro AX is for the tools agents use: a command line, an HTTP API, an MCP server.{" "}
            {"Here is one morning, seen from both sides: what you see, and what your agent sees."}
          </p>
          <p className="m-0 text-sm text-muted-foreground">
            {claim("The tool on this page is the kit's own example, and every line it prints here is real output from the kit, checked on every CI run.", {
              source: [{ file: "site/src/ax/transcripts.json" }, { test: "site/src/ax/ax.test.tsx::Ouro AX page > every transcript is what the kit's example tool prints, run through the kit" }],
              verify: { testExists: "site/src/ax/ax.test.tsx::Ouro AX page > every transcript is what the kit's example tool prints, run through the kit" },
            })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="#be-the-agent">{"Be the agent"}</Button>
            <Button href={href("/docs/ax/")} variant="outline" tone="secondary">
              Read the guide
            </Button>
          </div>
        </div>
        {exhibit}
      </Container>
    </section>
  );
}
