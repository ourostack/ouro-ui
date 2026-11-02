import type { JSX } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import { artMarkup, FigureValue, Mark, OutputLine, RuleText, Screen, Terminal, Transcript, WRAP } from "./parts";
import Playground from "./playground";
import { MORNING, MORNING_ART_ALT, TRANSCRIPTS, type Beat } from "./story";
import xray from "./xray-adopter.json";
import morningSource from "./art/morning-with-an-agent.svg?raw";

/*
 * The Ouro AX page's body (/ax/), under its hero (hero.tsx): a morning with an agent, told twice, as the person sees
 * it and as the agent sees it; then the same tool to try in the browser; then the X-ray of a real tool, before and
 * after. An island of the voyage page (island.tsx): the server renders it whole, and its script, with the kit, loads
 * only on this page.
 */

/** The drawing's markup without its title and notes: the band names it once, in plain words (art/manifest.json says who drew it). */
const morningArt = artMarkup(morningSource, 'preserveAspectRatio="xMidYMid slice" ');

/** The duo at one desk, its lines in the page's text colour: between the hero and the morning it tells. */
function MorningArt(): JSX.Element {
  return (
    <Container>
      <div
        role="img"
        aria-label={MORNING_ART_ALT}
        className="ax-art"
        dangerouslySetInnerHTML={{ __html: morningArt }}
      />
    </Container>
  );
}

/** 9:04 shows only the line of 9:03's real output that matters: the tool's own check. */
const CHECKED = TRANSCRIPTS.late.flatMap((step) => step.output.split("\n")).find((line) => line.startsWith("Checked:"))!;

const EVIDENCE = "https://github.com/ourostack/ouro-ui/tree/main/docs/decisions/2026-10-30-ouro-ax/evidence";

function BeatRow({ beat }: { beat: Beat }): JSX.Element {
  return (
    <li className="ax-beat border-t border-border/70" data-ax-beat={beat.id}>
      <p className="site-mono m-0 text-muted-foreground" aria-hidden="true">
        {beat.time}
      </p>
      <article aria-labelledby={`beat-${beat.id}`} className="grid min-w-0 gap-6">
        <h3 id={`beat-${beat.id}`} className="site-h3">
          <span className="sr-only">{beat.time}: </span>
          {beat.title}
        </h3>
        <div className="ax-pair grid items-start gap-4">
          <Screen label={"What you see"} seen={beat.seen} />
          {beat.steps.length > 0 ? (
            <Transcript label={"What your agent sees"} steps={beat.steps} waiting={beat.waiting} />
          ) : (
            <Terminal label={"What your agent sees"} role="group" aria-label={"What your agent sees"}>
              <pre className="ax-term-body" style={WRAP}>
                <OutputLine text={CHECKED} />
                <span className="ax-term-gap" aria-hidden="true" />
                <span className="ax-term-line ax-term-aside">{"Your agent moves on without reading the room back."}</span>
              </pre>
            </Terminal>
          )}
        </div>
        <div className="ax-finding grid gap-x-8 gap-y-3">
          {beat.figure ? (
            <p className="m-0 grid gap-1">
              <span className="ax-figure">
                <FigureValue value={beat.figure.value} />
              </span>
              <span className="text-sm text-muted-foreground">{beat.figure.label}</span>
            </p>
          ) : (
            <span aria-hidden="true" className="ax-finding-gap" />
          )}
          <p className="m-0 text-muted-foreground">{beat.why}</p>
        </div>
      </article>
    </li>
  );
}

/** Each must claim that changed, in plain words, above the X-ray's own. */
const HEADLINES: Record<string, string> = {
  "cli.inventory": "It lists the commands it has",
  "http.inventory": "It lists the routes it has",
  "cli.unknown-flag": "Misspell a flag, get told",
  "cli.others-preview": "See who'll see it before it's sent",
  "cli.wait-on-refs": "Wait on the chat you're already in",
  "http.wrong-ref-first": "Wrong id? It says where to find a right one",
};

function XrayCard({ title, commit, side }: { title: string; commit: string; side: (typeof xray)["before"] }): JSX.Element {
  return (
    <div className="ax-screen gap-2">
      <span className="ax-card-head">{title}</span>
      <p className="m-0 site-h3">{side.conformant ? "Conforms" : "Does not conform yet"}</p>
      <p className="m-0">
        <span className={side.conformant ? "ax-figure" : "ax-figure ax-figure-before"}>
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
      <MorningArt />
      <section aria-labelledby="morning-title" className="ax-band">
        <Container>
          <h2 id="morning-title" className="site-h2">
            {"Your morning"}
          </h2>
          <p className="site-lede mt-5">{"Before your first meeting, you ask your agent for a few things. You see them twice: on your screen, then in your agent's terminal."}</p>
          <ol className="m-0 mt-10 grid list-none gap-12 p-0">
            {MORNING.map((beat) => (
              <BeatRow key={beat.id} beat={beat} />
            ))}
          </ol>
        </Container>
      </section>

      <section id="be-the-agent" aria-labelledby="turn-title" className="ax-band ax-anchor border-t border-border/70">
        <Container className="grid gap-10">
          <div className="grid gap-4">
            <p className="site-eyebrow">Your turn</p>
            <h2 id="turn-title" className="site-h2">
              {"Be the agent"}
            </h2>
            <p className="site-lede">
              {"This is the same tool, running in your browser, and now you're the agent: the person you work for asks, and you run the commands. Type one or press one. Then start a wait, and answer it from the room as someone else."}
            </p>
          </div>
          <Playground />
        </Container>
      </section>

      <section aria-labelledby="xray-title" className="ax-band border-t border-border/70">
        <Container className="grid gap-10">
          <div className="grid gap-4">
            <p className="site-eyebrow">The X-ray</p>
            <h2 id="xray-title" className="site-h2">
              Then we X-rayed a real one
            </h2>
            <p className="site-lede">
              The X-ray calls a tool the way an agent would, without reading its code, and checks it against Ouro AX's claims.{" "}
              {claim("The first tool to adopt Ouro AX is a real app's agent interface: a command line plus an HTTP API.", {
                source: { file: "docs/decisions/2026-10-30-ouro-ax.md" },
                verify: { fileLine: "docs/decisions/2026-10-30-ouro-ax.md", pattern: "each built into a real app's agent interface \\(a command line plus an HTTP API\\)" },
              })}{" "}
              Here it is before and after.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <XrayCard title="Before: its main branch" commit={xray.before.commit} side={xray.before} />
            <XrayCard title="After: its adoption" commit={xray.after.commit} side={xray.after} />
          </div>
          <p className="m-0 text-muted-foreground">
            {claim("Every must claim held after adoption; before it, four failed and two could not be checked at all.", {
              source: [{ evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-main.md" }, { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-pr459.md" }],
              verify: [
                { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-main.md", pattern: "Does not conform yet: 4 must claims not holding; no inventory given; 2 must claims skipped" },
                { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-pr459.md", pattern: "Claims holding: 33 of 36 \\(must: 18 of 18\\)" },
              ],
            })}{" "}
            {claim("After, the 3 failing checks are all in should claims, which conforming doesn't require.", {
              source: { evidence: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-pr459.md" },
              verify: [
                { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-pr459.md", pattern: "Checks: 768 pass, 3 fail, 3 skipped" },
                { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-pr459.md", pattern: "\\| ✗ \\| `cli\\.read-json` \\| should \\| .* \\| 29 \\| 2 \\| 2 \\|" },
                { fileLine: "docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-pr459.md", pattern: "\\| ✗ \\| `http\\.error-teaches` \\| should \\| .* \\| 43 \\| 1 \\| 0 \\|" },
              ],
            })}{" "}
            Here is what changed, in plain words and then in the X-ray's own.
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
                <h3 className="m-0 site-h3">{HEADLINES[item.id] ?? item.id}</h3>
                <p className="m-0">
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
                    the tool had not yet listed its surfaces for it.
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

      <section aria-labelledby="build-title" className="ax-band border-t border-border/70">
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
          <ul className="ax-quad m-0 grid list-none gap-x-10 gap-y-8 p-0">
            {[
              { title: "The kit", body: "One definition per command gives the parser, help, errors, JSON and an MCP tool.", to: "/docs/ax/" },
              { title: "The claims", body: "The standard: checkable rules, with the reasons and the evidence that earned them their place.", to: "/docs/ax-standard/" },
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
