import type { JSX, ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock } from "../components/code";
import kit from "./kit.json";
import { LayersBand } from "./layers";
import { ReinsRace } from "./reins-race";
import { ReinsTerminal } from "./reins-terminal";
import { StoryOpener } from "../components/story-world";
import { AppleBand, AppleHero, AppleMenu, NextPage } from "./shell";
import "./feel-reins.css";

const GUIDE = `https://github.com/ourostack/ouro-ui-apple/blob/${kit.main}/docs/ouro-reins/README.md`;
const SKILL = `https://github.com/ourostack/ouro-ui-apple/blob/${kit.main}/docs/ouro-reins/SKILL.md`;
const REFLEX = "https://shopify.engineering/reflex";
// Pinned here rather than through kit.main: the protocol is newer than the commit the other Apple pages link.
const SPEC_COMMIT = "178bce5d5854d0e896fba34c4a241cabc8416dbb";
const PROTOCOL = `https://github.com/ourostack/ouro-ui-apple/blob/${SPEC_COMMIT}/docs/ouro-reins/PROTOCOL.md`;
const ANY_MAC = `https://github.com/ourostack/ouro-ui-apple/blob/${SPEC_COMMIT}/docs/ouro-reins/README.md#reins-for-any-mac-app`;

/** The same reins on any app: what a second driver, for whole Macs, adds. */
const ANY_MAC_PARTS: readonly { name: string; body: ReactNode }[] = [
  {
    name: "The tree",
    body: (
      <>
        Any app's tree of controls, pruned to what a person can act on. An element has a role, a label, a value and a frame, and an address like{" "}
        <code className="apple-code">toolbar &gt; button[Back]</code> that a recorded journey replays.
      </>
    ),
  },
  {
    name: "The pixels",
    body: (
      <>
        No tree to read (a login window, a canvas, a stuck screen)? A screenshot's text boxes become the same elements, the state says{" "}
        <code className="apple-code">"layer": "pixels"</code>, and an IP-KVM's keyboard and mouse do the clicking.
      </>
    ),
  },
  {
    name: "Refusals first",
    body: (
      <>
        <code className="apple-code">person-active</code> while someone is at the Mac. <code className="apple-code">app-protected</code> for an app that refuses
        automation, a password prompt or a security setting. <code className="apple-code">permission-missing</code> names the step a person takes. Nothing is
        touched.
      </>
    ),
  },
  {
    name: "One round trip",
    body: (
      <>
        Only lines cross the network. <code className="apple-code">batch</code> runs a whole form on the Mac and checks its untils there, and after the first
        screen only a diff against the <code className="apple-code">rev</code> you hold comes back.
      </>
    ),
  },
];

const ANY_MAC_LS = `$ ls Calculator
{"focus":"Calculator","path":["mac","studio","Calculator"],
 "state":{"layer":"ax","elements":[
   {"i":3,  "ref":"statictext[Edit field]", "value":"0"},
   {"i":8,  "ref":"button[7]",              "can":["click"]},
   {"i":11, "ref":"button[Multiply]",       "can":["click"]},
   {"i":23, "ref":"button[Equals]",         "can":["click"]} …]},
 "context":{"person":{"active":false,"idle_s":312}, …},
 "actions":[{"name":"click","title":"press it","from":"Calculator",
             "input":{"properties":{"element":{"enum":["button[7]", …]}, …}}}, …],
 "rev":"6c64…"}`;

const ANY_MAC_BATCH = `$ batch '[{"action":"click","input":{"element":"button[7]"}},
         {"action":"click","input":{"element":"button[Multiply]"}},
         {"action":"click","input":{"element":"button[6]"}},
         {"action":"click","input":{"element":"button[Equals]"},
          "until":{"@statictext[Edit field].value":"42"}}]'
{"ok":true,
 "steps":[{"n":0,"action":"click","ok":true,"ms":25}, …
          {"n":3,"action":"click","ok":true,"ms":36}],
 "screen":{"rev":"b81c…","since":"6c64…",
           "put":[{"ref":"statictext[Edit field]","role":"statictext",
                   "value":"42"}]}}`;

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
    var page: ReinsNode { path.last.map(\\.node) ?? .kitchen(store) }
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
      <StoryOpener scene="ouro-ui-apple" line="No thumbs needed: the robot drives all three screens with ls and do." />
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

      <AppleBand
        id="any-mac"
        eyebrow="Beyond our apps"
        title="Any app on a Mac, same reins."
        lede={
          <p>
            {claim("Reins is a protocol as well as a package: the screen, the requests and replies, every refusal with its exit code, journeys, and the batches and diffs a remote driver uses, written down on their own.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/178bce5d5854d0e896fba34c4a241cabc8416dbb/docs/ouro-reins/PROTOCOL.md" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/178bce5d5854d0e896fba34c4a241cabc8416dbb/docs/ouro-reins/PROTOCOL.md" },
            })}{" "}
            {claim("A second driver speaks it for whole Macs: Finder, System Settings or anyone's app, as state and actions, with no model in the loop and no clicking by guesswork.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/178bce5d5854d0e896fba34c4a241cabc8416dbb/docs/ouro-reins/README.md#reins-for-any-mac-app" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/178bce5d5854d0e896fba34c4a241cabc8416dbb/docs/ouro-reins/README.md" },
            })}
          </p>
        }
      >
        <ul className="apple-quad">
          {ANY_MAC_PARTS.map((item) => (
            <li key={item.name} className="apple-quad-item">
              <h3 className="apple-quad-title">{item.name}</h3>
              <p className="apple-quad-body">{item.body}</p>
            </li>
          ))}
        </ul>
        <div className="feel-reins-code">
          <CodeBlock code={ANY_MAC_LS} label="What an agent sees in Calculator" />
          <CodeBlock code={ANY_MAC_BATCH} label="Clicks and a check, one request" />
        </div>
        <p className="apple-fine">
          Write your own driver against the{" "}
          <a className="apple-inline-link" href={PROTOCOL}>
            protocol
          </a>
          , or read how the{" "}
          <a className="apple-inline-link" href={ANY_MAC}>
            any-Mac driver
          </a>{" "}
          reads trees and pixels and when it says no. Its code isn't public yet.
        </p>
      </AppleBand>

      <LayersBand current="/apple/reins/" />
      <NextPage current="/apple/reins/" />
    </div>
  );
}
