import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock } from "../components/code";
import { TapLockDuel } from "./feel-duel";
import { GatefoldFlip } from "./feel-gatefold";
import kit from "./kit.json";
import genres from "./feel-genres.json";
import { LayersBand } from "./layers";
import { AppleBand, AppleHero, AppleMenu, NextPage } from "./shell";
import "./feel-reins.css";

const GUIDE = `https://github.com/ourostack/ouro-ui-apple/blob/${kit.main}/docs/ouro-feel/README.md`;


const TEST_CODE = `import OuroFeel
import XCTest

@MainActor
final class FeelTests: XCTestCase {
    func testItFeelsRight() {
        let app = XCUIApplication()
        app.launch()
        let feel = OuroFeel(app)
        feel.expect(feel.wayBack(from: [.launch, .tab("Kitchen")]))
        feel.expect(feel.insideWindow())   // portrait, landscape, portrait again
    }
}`;

const RAPID_CODE = `let rapidBaseline = feel.osBaseline(rapid: true)  // UIKit, for context
feel.expect(feel.tapLanding(on: app.switches["appearance.pageNumbers"],
                            trials: 5, rapid: 5, rapidBaseline: rapidBaseline))`;

/** /apple/feel/: Ouro Feel, how an app feels, measured by genre of jank. */
export default function AppleFeel(): JSX.Element {
  return (
    <div id="apple-feel" className="apple">
      <AppleMenu current="/apple/feel/" />
      <AppleHero
        id="apple-feel-title"
        eyebrow="Ouro Feel"
        title={claim("Jank has genres. Feel has a check for each.", {
          source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L44-L60" },
          verify: [{ count: "site/src/apple/feel-genres.json#genres", is: 10 }, { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L44-L60" }],
        })}
        media={<TapLockDuel />}
        actions={
          <>
            <Button href="#first-catch">See its first catch</Button>
            <Button href="#genres" variant="outline" tone="secondary">
              Meet the genres
            </Button>
          </>
        }
      >
        <p>
          A taste reviewer can tell you a screen feels off. Ouro Feel tells you which way, where, and on which build, from a UI test that runs as often as you push. It walks
          your app the way a thumb would and leaves the humans only the real questions of taste.
        </p>
        <p className="apple-fine">
          These switches are the whole idea in miniature. One has the tap lock Feel's test app plants as a bug. Your thumb notices; now Feel does too.
        </p>
      </AppleHero>

      <AppleBand
        id="genres"
        eyebrow="The genres"
        title={claim("Ten genres, named and checked.", {
          source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L48-L59" },
          verify: [{ count: "site/src/apple/feel-genres.json#genres", is: 10 }, { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L48-L59" }],
        })}
        lede={
          <p>
            {claim("Each genre is one check, run from your UI tests on a simulator, with its own report.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L44-L60" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L44-L60" },
            })}{" "}
            {claim("A check that couldn't see enough says \"could not check\", and never passes on a hunch.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L246-L250" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L246-L250" },
            })}
          </p>
        }
      >
        <ol className="apple-lanes-list feel-genres">
          {genres.genres.map((genre, index) => (
            <li key={genre.name} className="apple-lane-row">
              <span className="apple-lane-step site-mono" aria-hidden="true">
                {index + 1}
              </span>
              <span className="apple-lane-name">{genre.name}</span>
              <span className="apple-lane-body">{genre.good}</span>
            </li>
          ))}
        </ol>
      </AppleBand>

      <AppleBand
        id="first-catch"
        eyebrow="First catch"
        title="Gatefold's panel had wandered off the edge."
        lede={
          <p>
            {claim("On its first real app, Feel's inside-the-window check found 32 control readings outside the window on Gatefold build 19, at 8ce5611, and passed the fix at bd9356e.", {
              source: [{ evidence: "site/src/apple/evidence/gatefold-8ce5611-fail.txt" }, { evidence: "site/src/apple/evidence/gatefold-bd9356e-pass.txt" }],
              verify: [
                { equals: "site/src/apple/feel-gatefold.json#before.outside", is: 32 },
                { fileLine: "site/src/apple/evidence/gatefold-8ce5611-fail.txt", pattern: "measured: outside=32, poses=3" },
                { fileLine: "site/src/apple/evidence/gatefold-bd9356e-pass.txt", pattern: "^PASS inside the window" },
              ],
            })}{" "}
            Gatefold is an e-reader, and its Fine-Tune panel is where you pick a font and fuss over margins.
          </p>
        }
      >
        <GatefoldFlip />
      </AppleBand>

      <AppleBand
        id="higher-bar"
        eyebrow="Tap landing"
        title="Our bar is higher than UIKit's."
        lede={
          <p>
            People tap again while a switch is still sliding.{" "}
            {claim("Feel double-taps a two-state control and reads where it ends: back where it started means both taps landed.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L144-L147" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L144-L147" },
            })}{" "}
            {claim("On the iOS 27.2 simulator, the Settings app's UIKit switch kept only the first tap of a double tap, 0 pairs in 5, while a SwiftUI Toggle kept both in 5 of 5.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L154-L156" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L154-L156" },
            })}{" "}
            {claim("So the system's own switch is shown beside yours for context, never as an excuse: every pair must end where it started.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L154-L160" },
              verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L154-L160" },
            })}
          </p>
        }
      >
        <div className="apple-pair feel-reins-wide">
          <CodeBlock code={RAPID_CODE} label="Rapid double taps" copy />
          <div className="apple-pair-side">
            <p className="apple-fine">
              Tried the duel up top? The locked switch is what a quick thumb meets on a control that's busy animating. Feel's report carries the same rapid line,
              after its single-tap count, plus where it ran and which clock timed it.
            </p>
          </div>
        </div>
      </AppleBand>

      <AppleBand
        id="add-it"
        eyebrow="Add it"
        title="A few lines in your UI tests."
        lede={
          <p>
            Link <code className="apple-code">OuroFeel</code> into your UI test target, point it at your entry points, and let it walk. A failing check fails the test,
            with its report attached.
          </p>
        }
      >
        <div className="apple-pair feel-reins-wide">
          <CodeBlock code={TEST_CODE} label="FeelTests.swift" copy />
          <div className="apple-pair-side">
            <p className="apple-fine">
              {kit.feelReinsRelease ? (
                <>Ouro Feel ships in ouro-ui-apple {kit.feelReinsRelease}. </>
              ) : (
                <>Ouro Feel is on ouro-ui-apple's main branch now, and comes in a later release. </>
              )}
              The{" "}
              <a className="apple-inline-link" href={GUIDE}>
                guide
              </a>{" "}
              walks through the flags, and the taste rubric says what still needs a human eye.
            </p>
            <p className="apple-fine">
              {claim("Its checks come from real reviews: Gatefold's reviewer drivers, Spoonjoy's jank tools and the HX gallery's motion gate.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L11-L13" },
                verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L11-L13" },
              })}{" "}
              Now they're one library your app can run too.
            </p>
          </div>
        </div>
      </AppleBand>

      <LayersBand current="/apple/feel/" />
      <NextPage current="/apple/feel/" />
    </div>
  );
}
