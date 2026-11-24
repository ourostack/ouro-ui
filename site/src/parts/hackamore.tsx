import { useState, type JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock } from "../components/code";
import { href } from "../paths";
import { Output, PartBand, PartNext } from "./shell";
import refusal from "@/docs/guides/evidence/part-pages/hackamore-refusal.txt?raw";

/*
 * /hackamore/: reins for apps that never had any. Written from hackamore's README at HACKAMORE, copied to
 * docs/guides/evidence/part-pages/hackamore-README.txt; the refusal is what hackamore printed at that commit against its own fixture engine
 * (docs/guides/evidence/part-pages/hackamore-refusal.txt).
 */

const HACKAMORE = "25e0eeda779c662a2caa30929e8b628cb001ed5a";
const REPO = "https://github.com/ourostack/hackamore";
const README = `${REPO}/blob/${HACKAMORE}/README.md`;
const ENGINE = `${REPO}/blob/${HACKAMORE}/test/fixtures/engine-stub.mjs`;

const COMMAND = `hackamore do click '{"element":"button[Allow]"}' --why "…"`;
/** What hackamore printed on stderr, its exit code and its error's code, from the evidence file. */
const SAID = /^stderr:\n(.+)$/m.exec(refusal)?.[1] ?? "";
const EXIT = /^exit=(\d+)$/m.exec(refusal)?.[1] ?? "";
const CODE = /"code": "([^"]+)"/.exec(refusal)?.[1] ?? "";

/** The README's own example: the same four presses as single calls, and as one batch that stops when the display says 42. */
const CONTRACT = `hackamore ls Calculator
hackamore do click '{"element":"button[7]"}'
hackamore batch '[{"action":"click","input":{"element":"button[7]"}},
                  {"action":"click","input":{"element":"button[Multiply]"}},
                  {"action":"click","input":{"element":"button[6]"}},
                  {"action":"click","input":{"element":"button[Equals]"},"until":{"@Edit field.value":"42"}}]'`;

/** The hero's demo: ask for a button that isn't on the screen, and see hackamore say no before anything moves. */
function AskForAllow(): JSX.Element {
  const [ran, setRan] = useState(false);
  return (
    <div className="grid gap-4">
      <Output label="A terminal" live>
        {`$ ${COMMAND}`}
        {ran ? (
          <>
            {"\n"}
            <span className="part-no">{SAID}</span>
            {`\nexit ${EXIT}, code "${CODE}"`}
          </>
        ) : null}
      </Output>
      <div className="part-controls">
        <Button onClick={() => setRan(true)}>Press Allow</Button>
      </div>
      <p className="part-fine">
        {claim("Real output from hackamore's own test app, whose window has nothing in it to click.", {
          source: { evidence: "docs/guides/evidence/part-pages/hackamore-refusal.txt" },
          verify: [
            { fileLine: "docs/guides/evidence/part-pages/hackamore-refusal.txt", pattern: "against its fixture engine \\(test/fixtures/engine-stub\\.mjs\\)" },
            { fileLine: "docs/guides/evidence/part-pages/hackamore-refusal.txt", pattern: "^hackamore: do click: click isn't available on screen\\." },
          ],
        })}{" "}
        <Link href={ENGINE}>The test app</Link>.
      </p>
    </div>
  );
}

const CONTRACT_ROWS = [
  {
    name: "The screen is state",
    body: claim("The front app and window, any alert on top, and a pruned tree of roles, labels, values and frames, addressed by role and label, so a recorded journey replays after the window moves.", {
      source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "so a recorded journey replays after the window moves" },
    }),
  },
  {
    name: "Actions fit this screen",
    body: claim("click's element is a list of what's there. Ask for something that isn't, and it's refused before anything moves, with the fix.", {
      source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "Asking for something that isn't there is refused before anything moves, with the fix\\." },
    }),
  },
  {
    name: "Refusals that teach",
    body: claim("Each refusal names the thing, the problem and the fix: action-unavailable, input-invalid, person-active, app-protected and more.", {
      source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "Each refusal names the thing, the problem and the fix\\." },
    }),
  },
  {
    name: "Batch in one call",
    body: claim("Many steps in one round trip, each of which may carry an until that is checked against the screen.", {
      source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "Each step may carry an `until` that is checked next to the screen" },
    }),
  },
];

const RULES = [
  {
    name: "Never a screen a person is using",
    body: claim("Every action passes a gate: the Mac unlocked, and nobody's input for 90 seconds. A person's touch stops it.", {
      source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "Every action passes a gate: the Mac unlocked, and nobody's input for 90 seconds" },
    }),
  },
  {
    name: "Protected apps stay protected",
    body: claim("Password prompts, Keychain Access, Passwords and the security panes of System Settings refuse automation.", {
      source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "password prompts, Keychain Access, Passwords, and security panes of System Settings" },
    }),
  },
  {
    name: "Passwords stay in the Keychain",
    body: claim("A secret is read from the Keychain on the Mac that types it, and typed only into a field asking for a password.", {
      source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "the value is read on the Mac that types it and only typed into a field that is asking for a password" },
    }),
  },
  {
    name: "Permission prompts only when told",
    body: claim("It answers a permission prompt only when the Mac's owner recorded that answer.", {
      source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "A permission prompt is answered only when the owner said so" },
    }),
  },
];

/** /hackamore/: drive any Mac app through its accessibility tree, with refusals before anything moves. */
export default function HackamorePage(): JSX.Element {
  return (
    <div id="hackamore" className="part">
      <div className="part-hero">
        <Hero
          layout="split"
          eyebrow="Hackamore"
          badge={
            <Badge tone="warning" variant="soft">
              Experimental
            </Badge>
          }
          title={claim("Reins for apps that never had any.", {
            source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
            verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "hackamore steers apps that were never built for it" },
          })}
          description={
            <div className="grid gap-3">
              <p>
                {claim("Drive any Mac app through its accessibility tree; ask for something that isn't there and it says no, with the fix, before touching the app.", {
                  source: [{ evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" }, { evidence: "docs/guides/evidence/part-pages/hackamore-refusal.txt" }],
                  verify: [
                    { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "Asking for something that isn't there is refused before anything moves, with the fix\\." },
                    { fileLine: "docs/guides/evidence/part-pages/hackamore-refusal.txt", pattern: "\"code\": \"action-unavailable\"" },
                  ],
                })}
              </p>
              <p className="part-fine">
                {claim("A hackamore is a bridle with no bit: you steer without putting anything in the horse's mouth.", {
                  source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
                  verify: { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "A hackamore is a bridle with no bit: you steer without putting anything in the horse's mouth\\." },
                })}{" "}
                Hackamore is part of the Ouro UI family.
              </p>
            </div>
          }
          media={<AskForAllow />}
          actions={
            <>
              <Button href={REPO}>Hackamore on GitHub</Button>
              <Button href="#contract" variant="outline" tone="secondary">
                How it works
              </Button>
            </>
          }
        />
      </div>

      <PartBand
        id="why"
        eyebrow="Why"
        title="A window already knows what's in it."
        lede={
          <p>
            {claim("Instead of a screenshot and a model guessing where the button is, hackamore reads macOS's accessibility tree and hands an agent the screen as data, with the actions that make sense on that screen right now, and no model in the loop.", {
              source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
              verify: [
                { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "hands an agent the screen as data, with the actions that make sense on that screen right now" },
                { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "For agents, with no model in the loop\\." },
              ],
            })}
          </p>
        }
      />

      <PartBand
        id="contract"
        eyebrow="The contract"
        title="The screen as state, its controls as actions."
        lede={
          <p>
            {claim("It speaks Reins, the protocol Ouro UI's own apps use to let agents drive them, from the outside, for apps that were never built for it.", {
              source: { evidence: "docs/guides/evidence/part-pages/hackamore-README.txt" },
              verify: [
                { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "the protocol our own apps use to let agents drive them" },
                { fileLine: "docs/guides/evidence/part-pages/hackamore-README.txt", pattern: "hackamore steers apps that were never built for it" },
              ],
            })}{" "}
            <Link href={href("/apple/reins/")}>Ouro Reins</Link> drives an app from the inside.
          </p>
        }
      >
        <div className="part-pair">
          <CodeBlock wrap code={CONTRACT} label="From the README" />
          <ul className="part-rows">
            {CONTRACT_ROWS.map((row) => (
              <li key={row.name} className="part-row">
                <h3 className="part-row-name">{row.name}</h3>
                <p className="part-row-body">{row.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </PartBand>

      <PartBand id="rules" eyebrow="The rules it won't break" title="Hands off when a person is there.">
        <ul className="part-rows">
          {RULES.map((rule) => (
            <li key={rule.name} className="part-row">
              <h3 className="part-row-name">{rule.name}</h3>
              <p className="part-row-body">{rule.body}</p>
            </li>
          ))}
        </ul>
        <p className="part-fine">
          The <Link href={README}>README</Link> says what has run on a real Mac and what runs against fakes. More ways to look inside: <Link href={href("/xray/")}>X-ray</Link>.
        </p>
      </PartBand>

      <PartNext current="/hackamore/" />
    </div>
  );
}
