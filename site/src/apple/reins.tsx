import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock } from "../components/code";
import kit from "./kit.json";
import { LayersBand } from "./layers";
import { ReinsRace } from "./reins-race";
import { ReinsTerminal } from "./reins-terminal";
import { AppleBand, AppleHero, AppleMenu, NextPage } from "./shell";
import "./feel-reins.css";

const GUIDE = `https://github.com/ourostack/ouro-ui-apple/blob/${kit.main}/docs/ouro-reins/README.md`;
const SKILL = `https://github.com/ourostack/ouro-ui-apple/blob/${kit.main}/docs/ouro-reins/SKILL.md`;
const REFLEX = "https://shopify.engineering/reflex";

/** What an agent sees, in four ideas. */
const MODEL = [
  { name: "Nodes", body: "A screen is a little tree. A node has a name, its state as JSON, and the actions it offers, with an input schema for those that take input." },
  { name: "The focus", body: "The deepest node is the screen in front of you. ls shows it, its path, and the actions you may run right now." },
  { name: "Lending", body: "A navigation stack lends goBack once you're deeper than its root; a tab bar lends selectTab. If two could lend the same action, the nearest one does." },
  { name: "Refusal", body: "Ask for something that isn't on offer and Reins says no before any app code runs, and lists what is." },
] as const;

const DRIVABLE = `import OuroReins

@MainActor
final class Shell: ReinsDrivable {
    let store: AppStore
    var path: [Route] = []
    var page: ReinsNode { path.last.map(\.node) ?? .kitchen(store) }
    func select(_ tab: String) { path = []; store.tab = tab }
    var reinsNode: ReinsNode {
        .tabs(selected: store.tab, tabs: ["kitchen", "shopping"],
              select: { self.select($0) }, child:
            .stack(depth: path.count,
                   goBack: { self.path.removeLast() }, child: page))
    }
}`;

const JOURNEY = `try await ReinsNetworkGuard.withNetworkBlocked {
    let journey = ReinsJourney(ReinsSession(Shell(store: .fixtureKitchen())))
    try await journey.do("openRecipe", ["id": "recipe_pasta"],
                         until: { $0.focus == "recipe" })
    try await journey.do("goBack", until: { $0.focus == "kitchen" })
}`;

/** /apple/reins/: Ouro Reins, agents drive an app's screens as state and actions. */
export default function AppleReins(): JSX.Element {
  return (
    <div id="apple-reins" className="apple">
      <AppleMenu current="/apple/reins/" />
      <AppleHero
        id="apple-reins-title"
        eyebrow="Ouro Reins"
        title="Hand an agent the reins."
        media={
          <div className="reins-hero-race" id="race">
            <h2 className="reins-hero-race-title">
              {claim("Nineteen milliseconds against seventeen seconds.", {
                source: [{ evidence: "site/src/apple/evidence/reins-headless-timing.json" }],
                verify: [
                  { equals: "site/src/apple/evidence/reins-headless-timing.json#medianMs", is: 18.7 },
                  { equals: "site/src/apple/evidence/reins-headless-timing.json#xcuitest.medianJourneyMs", is: 16677 },
                ],
              })}
            </h2>
            <ReinsRace />
            <p className="apple-fine">
              {claim("Spoonjoy's journey from the Kitchen to a recipe, into cook mode, a step forward and back, and home took a median 18.7 ms headless through Reins, over 50 runs, and 16.7 s through XCUITest on a simulator, over 5.", {
                source: [{ evidence: "site/src/apple/evidence/reins-headless-timing.json" }, { evidence: "site/src/apple/evidence/reins-xcuitest-timing.txt" }],
                verify: [
                  { equals: "site/src/apple/evidence/reins-headless-timing.json#medianMs", is: 18.7 },
                  { equals: "site/src/apple/evidence/reins-headless-timing.json#runs", is: 50 },
                  { equals: "site/src/apple/evidence/reins-headless-timing.json#xcuitest.medianJourneyMs", is: 16677 },
                  { fileLine: "site/src/apple/evidence/reins-xcuitest-timing.txt", pattern: "median journey 16677 ms" },
                ],
              })}{" "}
              The simulator's lane runs at real speed, so bring a snack, or skip to the end.
            </p>
          </div>
        }
        actions={
          <>
            <Button href="#drive">Take the reins</Button>
            <Button href="#model" variant="outline" tone="secondary">
              See what an agent sees
            </Button>
          </>
        }
      >
        <p>
          Agents used to drive apps the way a tourist drives abroad: squinting at screenshots, tapping where the label probably is. With Ouro Reins an agent reads the
          screen as state and actions and drives it with <code className="apple-code">ls</code> and <code className="apple-code">do</code>. Headless, from
          fixtures, with the network blocked, in milliseconds.
        </p>
        <p className="apple-fine">
          The idea is Shopify's{" "}
          <a className="apple-inline-link" href={REFLEX}>
            Reflex
          </a>
          , which showed view models driven this way. We took the contract, left the macro, and brought it to SwiftUI. Thank you, Shopify.
        </p>
      </AppleHero>

      <AppleBand
        id="drive"
        eyebrow="Your turn"
        title="Drive a kitchen from here."
        lede={
          <p>
            This is a pretend kitchen in your browser, shaped like the tree Spoonjoy's real app hands Reins: the same screens and actions, refusing in Reins' own words. Open the pasta, start
            cooking, turn a step, then ask for something that isn't on offer and watch it say no nicely.
          </p>
        }
      >
        <ReinsTerminal />
      </AppleBand>

      <AppleBand id="model" eyebrow="The model" title="What an agent sees.">
        <ul className="apple-quad">
          {MODEL.map((item) => (
            <li key={item.name} className="apple-quad-item">
              <h3 className="apple-quad-title">{item.name}</h3>
              <p className="apple-quad-body">{item.body}</p>
            </li>
          ))}
        </ul>
      </AppleBand>

      <AppleBand
        id="drivable"
        eyebrow="Make it drivable"
        title="One object, built from what you have."
        lede={
          <p>
            You don't rewrite your view models. You add one object that builds the tree from them, and move any glue that lives in a view into a model both can call.
          </p>
        }
      >
        <div className="feel-reins-code">
          <CodeBlock code={DRIVABLE} label="Shell.swift" copy />
          <CodeBlock code={JOURNEY} label="A journey, in a test" copy />
        </div>
      </AppleBand>

      <AppleBand
        id="network"
        eyebrow="Offline, on purpose"
        title="The network is blocked, and checked."
        lede={
          <p>
            {claim("While the guard is up, every request through URLSession.shared fails, and the test fails afterwards even when the app recovered.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-reins/README.md#L122-L126" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-reins/README.md#L122-L126" },
            })}{" "}
            {claim("Spoonjoy's journeys made no attempts, and a control run that went live was caught at it.", {
              source: { evidence: "site/src/apple/evidence/reins-headless-timing.json" },
              verify: [
                { fileLine: "site/src/apple/evidence/reins-headless-timing.json", pattern: "0 network attempts" },
                { fileLine: "site/src/apple/evidence/reins-headless-timing.json", pattern: "liveFirstControlCaught" },
              ],
            })}{" "}
            A journey that needs the internet isn't a test, it's a weather report.
          </p>
        }
      >
        <div className="apple-steps">
          <p className="apple-fine">
            In a running debug build the same lines work over a local socket, so an agent can drive the real app on a simulator. Release builds leave it out
            entirely, and CI keeps it that way.{" "}
            {kit.feelReinsRelease ? (
              <>Ouro Reins ships in ouro-ui-apple {kit.feelReinsRelease}.</>
            ) : (
              <>Ouro Reins is on ouro-ui-apple's main branch now, and comes in a later release.</>
            )}{" "}
            Read the{" "}
            <a className="apple-inline-link" href={GUIDE}>
              guide
            </a>{" "}
            or hand your agent its{" "}
            <a className="apple-inline-link" href={SKILL}>
              skill
            </a>
            . One honest limit, shared with Reflex: a screen shows one column at a time, so a split view shows only the column in focus.
          </p>
        </div>
      </AppleBand>

      <LayersBand current="/apple/reins/" />
      <NextPage current="/apple/reins/" />
    </div>
  );
}
