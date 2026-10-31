import type { JSX } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import { Mark, RuleText, Screen, Transcript } from "./parts";
import Playground from "./playground";
import { MORNING, type Beat } from "./story";
import transcripts from "./transcripts.json";
import xray from "./xray-tandem.json";

/*
 * The Ouro AX page's body (/ax/), under its hero (hero.tsx): a morning with an agent, told twice, as the person sees
 * it and as the agent sees it; then the same tool to try in the browser; then the X-ray of a real tool, before and
 * after. An island of the voyage page (island.tsx): the server renders it whole, and its script, with the kit, loads
 * only on this page.
 */

const EVIDENCE = "https://github.com/ourostack/ouro-ui/tree/main/docs/decisions/2026-10-30-ouro-ax/evidence";

function BeatRow({ beat }: { beat: Beat }): JSX.Element {
  return (
    <li className="grid gap-6 border-t border-border/70 pt-8 lg:grid-cols-[6rem_minmax(0,1fr)] lg:gap-10" data-ax-beat={beat.id}>
      <p className="site-mono m-0 text-muted-foreground" aria-hidden="true">
        {beat.time}
      </p>
      <article aria-labelledby={`beat-${beat.id}`} className="grid min-w-0 gap-6">
        <h3 id={`beat-${beat.id}`} className="site-h3">
          <span className="sr-only">{beat.time}: </span>
          {beat.title}
        </h3>
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Screen label="What Sam sees" seen={beat.seen} />
          {beat.steps.length > 0 ? (
            <Transcript label="What the agent sees" steps={beat.steps} waiting={beat.waiting} />
          ) : (
            <Transcript label="What the agent sees" steps={transcripts.late.slice(1)} after="The agent moves on without reading the room back." />
          )}
        </div>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-baseline">
          {beat.figure ? (
            <p className="m-0 grid gap-1">
              <span className="ax-figure">{beat.figure.value}</span>
              <span className="text-sm text-muted-foreground">{beat.figure.label}</span>
            </p>
          ) : (
            <span aria-hidden="true" className="hidden sm:block" />
          )}
          <p className="m-0 text-muted-foreground">{beat.why}</p>
        </div>
      </article>
    </li>
  );
}

function XrayCard({ title, commit, side }: { title: string; commit: string; side: (typeof xray)["before"] }): JSX.Element {
  return (
    <div className="ax-screen gap-2">
      <span className="ax-card-head">{title}</span>
      <p className="m-0 site-h3">{side.conformant ? "Conforms" : "Does not conform yet"}</p>
      <p className="m-0">
        <span className="ax-figure">
          {side.mustHolding} of {side.must}
        </span>
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        must claims holding · {side.pass} checks pass, {side.fail} fail · <span className="site-mono">{commit.slice(0, 8)}</span>
      </p>
    </div>
  );
}

export default function AxPage(): JSX.Element {
  const flipped = xray.must.filter((item) => item.before !== "holds");
  const held = xray.must.filter((item) => item.before === "holds");
  return (
    <div id="ax">
      <section aria-labelledby="morning-title" className="py-16 lg:py-24">
        <Container>
          <h2 id="morning-title" className="site-h2">
            Sam's morning
          </h2>
          <p className="site-lede mt-5">Sam asks their agent for a few things before the first meeting. You see them twice: in Sam's app on the left, and in the agent's terminal on the right.</p>
          <ol className="m-0 mt-10 grid list-none gap-12 p-0">
            {MORNING.map((beat) => (
              <BeatRow key={beat.id} beat={beat} />
            ))}
          </ol>
        </Container>
      </section>

      <section id="your-turn" aria-labelledby="turn-title" className="scroll-mt-20 border-t border-border/70 py-16 lg:py-24">
        <Container className="grid gap-10">
          <div className="grid gap-4">
            <p className="site-eyebrow">Your turn</p>
            <h2 id="turn-title" className="site-h2">
              Be the agent
            </h2>
            <p className="site-lede">
              This is the same tool, running in your browser. Type a command or press one. Then start a wait, and answer it from the room as someone else.
            </p>
          </div>
          <Playground />
        </Container>
      </section>

      <section aria-labelledby="xray-title" className="border-t border-border/70 py-16 lg:py-24">
        <Container className="grid gap-10">
          <div className="grid gap-4">
            <p className="site-eyebrow">The X-ray</p>
            <h2 id="xray-title" className="site-h2">
              Then we X-rayed a real one
            </h2>
            <p className="site-lede">
              The X-ray calls a tool the way an agent would, without reading its code, and checks it against Ouro AX's claims.{" "}
              {claim("Tandem's agent tool was the first to adopt Ouro AX.", {
                source: { file: "docs/decisions/2026-10-30-ouro-ax.md" },
                verify: { fileLine: "docs/decisions/2026-10-30-ouro-ax.md", pattern: "into Tandem, the first adopter" },
              })}{" "}
              Here it is before and after.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <XrayCard title="Before: Tandem's main branch" commit={xray.before.commit} side={xray.before} />
            <XrayCard title="After: Tandem's adoption" commit={xray.after.commit} side={xray.after} />
          </div>
          <p className="m-0 text-muted-foreground">
            {claim("Every must claim held after adoption; before it, four failed and two could not be checked at all.", {
              source: [{ evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-tandem-main.md" }, { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-tandem-pr459.md" }],
              verify: [
                { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-tandem-main.md", pattern: "Does not conform yet: 4 must claims not holding; no inventory given; 2 must claims skipped" },
                { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-tandem-pr459.md", pattern: "Claims holding: 33 of 36 \\(must: 18 of 18\\)" },
              ],
            })}{" "}
            Here is what changed, in the X-ray's own words.
          </p>
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2" aria-label="Must claims that changed">
            {flipped.map((item) => (
              <li key={item.id} className="ax-screen gap-3" data-ax-claim={item.id}>
                <div className="flex items-center gap-2">
                  <Mark state={item.before as "fails" | "skipped"} />
                  <span aria-hidden="true" className="text-muted-foreground">
                    →
                  </span>
                  <Mark state="holds" />
                  <span className="site-mono text-muted-foreground">{item.id}</span>
                </div>
                <p className="m-0 font-medium">
                  <RuleText text={item.rule} />
                </p>
                {"found" in item && item.found ? (
                  <p className="m-0 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Before, the X-ray found: </span>
                    <RuleText text={item.found} />
                  </p>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Before, the X-ray could not check it: </span>
                    Tandem had not yet listed its surfaces for it.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <details className="ax-screen">
            <summary className="cursor-pointer font-medium">The {held.length} must claims that held before and after</summary>
            <ul className="m-0 mt-2 grid list-none gap-3 p-0">
              {held.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <Mark state="holds" />
                  <span>
                    <RuleText text={item.rule} />
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <p className="m-0 text-sm text-muted-foreground">
            Both reports are in Ouro AX's{" "}
            <a className="site-quiet-link" href={EVIDENCE}>
              evidence folder
            </a>
            , with the measurements behind the figures on this page.
          </p>
        </Container>
      </section>

      <section aria-labelledby="build-title" className="border-t border-border/70 py-16 lg:py-24">
        <Container className="grid gap-10">
          <div className="grid gap-4">
            <p className="site-eyebrow">Build one</p>
            <h2 id="build-title" className="site-h2">
              Make your tool obvious to agents
            </h2>
            <p className="site-lede">
              Ouro AX is a standard, a kit and an X-ray. Copy the kit in the way you copy Ouro HX components, define each command once, and run the X-ray in CI.
            </p>
          </div>
          <ul className="m-0 grid list-none gap-x-10 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "The kit", body: "One definition per command gives the parser, help, errors, JSON and an MCP tool.", to: "/docs/ax/" },
              { title: "The claims", body: "The standard: checkable rules, with the reasons and the evidence that admitted them.", to: "/docs/ax-standard/" },
              { title: "The X-ray", body: "Checks any command line, HTTP API or MCP server against the claims, from outside.", to: "/docs/ax-conformance/" },
              { title: "How we measure", body: "Real agents, fresh sessions, real tasks, scored from the end state.", to: "/docs/ax-eval/" },
            ].map((card) => (
              <li key={card.title} className="grid content-start gap-2 border-t border-border/70 pt-4">
                <h3 className="m-0 text-base font-semibold text-foreground">
                  <a className="site-quiet-link" href={href(card.to)}>
                    {card.title}
                  </a>
                </h3>
                <p className="m-0 text-sm text-muted-foreground">{card.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </div>
  );
}
