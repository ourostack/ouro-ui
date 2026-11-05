import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock, Command } from "../components/code";
import { href } from "../paths";
import { Angler } from "./angler";
import { AppleBand, AppleHero, AppleMenu, NextPage } from "./shell";
import { XrayExplorer } from "./xray-explorer";

const TOOL_CODE = `@AppIntent(.tool)
struct StartCookAlong: AppIntent {
    static let title: LocalizedStringResource = "Start cooking a recipe"
    static let description = IntentDescription(
        "Opens cook mode on the recipe's first step and reads it aloud."
    )
    @Parameter(title: "Recipe") var recipe: RecipeEntity
    …
}`;

const XRAY_COMMAND = "swift run ouro-ax-xray --app path/to/App.app --out report";
const SKILLS_COMMAND = "swift run ouro-ax-skills lint path/to/Skills.skillsbundle";

/** What Siri meets when it meets your app. */
const SURFACES = [
  { name: "App Intents", body: "The things your app can do. Siri reads their titles and descriptions like a menu." },
  { name: "App entities", body: "The things your app knows about, like a recipe or a document, findable by name." },
  { name: "App Shortcuts", body: "Phrases that work before anyone has set anything up." },
  { name: "App skills", body: "A short how-to, in Markdown, that teaches Siri your app's way of doing a longer job." },
] as const;

/** The X-ray's five ways of knowing, cheapest first. */
const LANES = [
  { name: "App Intents metadata", body: "Reads what the built app declares, right on your Mac." },
  { name: "Skills linter", body: "Checks the skills bundle's shape, names and words." },
  { name: "AppIntentsTesting", body: "Runs the app's queries, Spotlight index and errors in a test, without Siri." },
  { name: "SiriEvaluations", body: "Asks Siri itself, again and again, on a device running the Siri beta." },
  { name: "A person", body: "Some things only a human can judge, so the report says which and leaves them open." },
] as const;

/** /apple/ax/: Ouro AX for Apple, the App Intents X-ray and its real reports. */
export default function AppleAx(): JSX.Element {
  return (
    <div id="apple-ax" className="apple">
      <AppleMenu current="/apple/ax/" />
      <AppleHero
        id="apple-ax-title"
        eyebrow="Ouro AX for Apple"
        title="Siri reads your app like a manual. Write a good one."
        media={<Angler />}
        actions={
          <>
            <Button href="#xray">Browse the X-ray</Button>
            <Button href="#yours" variant="outline" tone="secondary">
              X-ray your app
            </Button>
          </>
        }
      >
        <p>
          On Apple's platforms, an agent meets your app through App Intents. Siri picks what to call from titles and descriptions, finds your things by name, and follows
          your skills. Ouro AX for Apple is the checklist for getting that right, and an X-ray that checks it for you.
        </p>
      </AppleHero>

      <AppleBand id="surfaces" eyebrow="The door" title="What Siri sees when it looks at your app.">
        <ul className="apple-quad">
          {SURFACES.map((surface) => (
            <li key={surface.name} className="apple-quad-item">
              <h3 className="apple-quad-title">{surface.name}</h3>
              <p className="apple-quad-body">{surface.body}</p>
            </li>
          ))}
        </ul>
      </AppleBand>

      <AppleBand
        id="lanes"
        eyebrow="How it knows"
        title="It knows how it knows."
        lede={
          <p>
            {claim("The X-ray reads a built app from outside, never importing its code, and checks it against thirty claims.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/README.md#L72" },
              verify: [{ equals: "site/src/apple/kit.json#claims", is: 30 }, { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/README.md#L72" }],
            })}{" "}
            It's honest about its limits: what only Siri can answer stays open until Siri is asked.
          </p>
        }
      >
        <ol className="apple-lanes-list">
          {LANES.map((lane, index) => (
            <li key={lane.name} className="apple-lane-row">
              <span className="apple-lane-step site-mono" aria-hidden="true">
                {index + 1}
              </span>
              <span className="apple-lane-name">{lane.name}</span>
              <span className="apple-lane-body">{lane.body}</span>
            </li>
          ))}
        </ol>
      </AppleBand>

      <AppleBand
        id="xray"
        eyebrow="Real reports"
        title="Spoonjoy and Ouro MD, X‑rayed, before and after."
        lede={
          <p>
            {claim(
              "Spoonjoy went from 5 to 12 of 29 claims holding, and Ouro MD from 8 of 29 to 14 of 30.",
              {
                source: [{ evidence: "site/src/apple/xray/spoonjoy.json" }, { evidence: "site/src/apple/xray/ouro-md.json" }],
                verify: [
                  { equals: "site/src/apple/xray/spoonjoy.json#before.summary.holding", is: 5 },
                  { equals: "site/src/apple/xray/spoonjoy.json#after.summary.holding", is: 12 },
                  { equals: "site/src/apple/xray/ouro-md.json#before.summary.holding", is: 8 },
                  { equals: "site/src/apple/xray/ouro-md.json#after.summary.holding", is: 14 },
                  { equals: "site/src/apple/xray/spoonjoy.json#after.summary.claims", is: 29 },
                  { equals: "site/src/apple/xray/ouro-md.json#before.summary.claims", is: 29 },
                  { equals: "site/src/apple/xray/ouro-md.json#after.summary.claims", is: 30 },
                ],
              },
            )}{" "}
            Plenty of what's left is waiting for Siri's beta or a person rather than failing. Flip between before and after, and open any claim for its reason and its fix.
          </p>
        }
      >
        <XrayExplorer />
      </AppleBand>

      <AppleBand
        id="siri-tools"
        eyebrow="Siri AI"
        title="Tools and skills, ready for the new Siri."
        lede={
          <p>
            Mark an intent as a tool and Siri AI can call it in the middle of a conversation. Give it a skill and Siri learns your app's way of doing a longer job, like
            cooking along with a recipe, step by step.{" "}
            {claim("The Siri AI parts need the Xcode 27.3 beta SDK, and until you build with it they compile to nothing.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/README.md#L89" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/README.md#L89" },
            })}
          </p>
        }
      >
        <div className="apple-pair">
          <CodeBlock code={TOOL_CODE} label="A tool intent" />
          <div className="apple-pair-side">
            <p className="apple-fine">
              The skills linter checks a skills bundle at build time, with errors pinned to the line, so a typo in a skill's frontmatter is caught before Siri meets it.
            </p>
            <Command command={SKILLS_COMMAND} />
          </div>
        </div>
      </AppleBand>

      <AppleBand
        id="yours"
        eyebrow="Your turn"
        title="X-ray your own app."
        lede={<p>Build your app, point the X-ray at it, and get the same report you just browsed: Markdown for people, JSON for CI, and a page for everyone else.</p>}
      >
        <div className="apple-steps">
          <Command command={XRAY_COMMAND} />
          <p className="apple-fine">
            That reads the metadata and lints the skills, right on your Mac. Add the behaviour stage when you're ready, and write a Siri scenario set for the parts only Siri can
            answer.{" "}
            <a className="site-quiet-link" href={href("/apple/start/#xray")}>
              The full recipe
            </a>
            .
          </p>
        </div>
      </AppleBand>
      <NextPage current="/apple/ax/" />
    </div>
  );
}
