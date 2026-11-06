import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import kit from "./kit.json";
import { LayersBand } from "./layers";
import { Loop } from "./loop";
import { AppleBand, AppleHero, AppleMenu, NextPage } from "./shell";
import ouroMd from "./xray/ouro-md.json";
import spoonjoy from "./xray/spoonjoy.json";

/** The section's front page (/apple/): what Ouro UI for Apple is, its two halves, and two apps that show it off. */
export default function AppleHome(): JSX.Element {
  return (
    <div id="apple-home" className="apple">
      <AppleMenu current="/apple/" />
      <AppleHero
        id="apple-home-title"
        eyebrow="Ouro UI for Apple"
        title={
          <>
            Same manners,
            <br /> now in Swift.
          </>
        }
        actions={
          <>
            <Button href={href("/apple/start/")}>Add the package</Button>
            <Button href={href("/apple/hx/")} variant="outline" tone="secondary">
              Feel the springs
            </Button>
          </>
        }
        media={<Loop clip="hx-themes" size="lg" className="apple-hero-media" />}
      >
        <p>
          Ouro HX is how an app feels in the hand: its springs, its taps, its colours. Ouro AX is how it reads to Siri and the other agents that come knocking. Both now
          come for iPhone, iPad and Mac.
        </p>
        <p className="apple-fine">
          {claim("One Swift package, for iOS 18 and macOS 15 or later.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Package.swift#L9" },
            verify: [
              { equals: "site/src/apple/kit.json#requires.iOS", is: "18" },
              { equals: "site/src/apple/kit.json#requires.macOS", is: "15" },
            ],
          })}{" "}
          {claim("Its colours and motion come from the same tokens as this website's, byte for byte.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/README.md#L7" },
            verify: { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/README.md#L7" },
          })}
        </p>
      </AppleHero>

      <AppleBand id="apple-halves" eyebrow="Two halves" title="One for the thumb, one for the agent.">
        <ul className="apple-doors">
          <li className="apple-door">
            <p className="apple-door-kicker">Ouro HX for Apple</p>
            <h3 className="site-h3">
              <a className="apple-door-link" href={href("/apple/hx/")}>
                The feel <span aria-hidden="true">→</span>
              </a>
            </h3>
            <p className="apple-door-body">
              {claim("One spring, one press, eight named haptic moments and six themes.", {
                source: [{ spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Sources/OuroHX/Haptics/OuroHaptics.swift" }, { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Sources/OuroHX/Tokens/OuroTokens.swift" }],
                verify: [
                  { count: "site/src/apple/kit.json#haptics", is: 8 },
                  { count: "site/src/apple/kit.json#themes", is: 6 },
                ],
              })}{" "}
              Watch them in SwiftUI, then poke their web twins right here.
            </p>
          </li>
          <li className="apple-door">
            <p className="apple-door-kicker">Ouro Feel</p>
            <h3 className="site-h3">
              <a className="apple-door-link" href={href("/apple/feel/")}>
                The tattletale <span aria-hidden="true">→</span>
              </a>
            </h3>
            <p className="apple-door-body">
              Jank comes in genres, from a missing way back to a switch that drops your second tap. Feel checks them from a UI test, and you can duel a twitchy switch
              on its page.
            </p>
          </li>
          <li className="apple-door">
            <p className="apple-door-kicker">Ouro AX for Apple</p>
            <h3 className="site-h3">
              <a className="apple-door-link" href={href("/apple/ax/")}>
                The X-ray <span aria-hidden="true">→</span>
              </a>
            </h3>
            <p className="apple-door-body">
              {claim("It reads a built app's App Intents from outside and checks them against thirty claims.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Sources/OuroAXTesting/Resources/apple.claims.json" },
                verify: { equals: "site/src/apple/kit.json#claims", is: 30 },
              })}{" "}
              Browse Spoonjoy's and Ouro MD's real reports, before and after.
            </p>
          </li>
          <li className="apple-door">
            <p className="apple-door-kicker">Ouro Reins</p>
            <h3 className="site-h3">
              <a className="apple-door-link" href={href("/apple/reins/")}>
                The reins <span aria-hidden="true">→</span>
              </a>
            </h3>
            <p className="apple-door-body">
              Agents drive your app's screens as state and actions with <code className="apple-code">ls</code> and <code className="apple-code">do</code>, headless and
              offline. Drive a pretend kitchen yourself, then race the simulator.
            </p>
          </li>
          <li className="apple-door">
            <p className="apple-door-kicker">Get started</p>
            <h3 className="site-h3">
              <a className="apple-door-link" href={href("/apple/start/")}>
                One line of Swift <span aria-hidden="true">→</span>
              </a>
            </h3>
            <p className="apple-door-body">Add the package, set a theme, and your first spring is one modifier away.</p>
          </li>
        </ul>
      </AppleBand>

      <AppleBand
        id="apple-showcases"
        eyebrow="Showcases"
        title="Two apps, showing off."
        lede={<p>A couple of the apps that already wear it. They aren't the whole crew, just the pair who volunteered for the photos.</p>}
      >
        <div className="apple-showcases">
          <article className="apple-showcase" aria-labelledby="showcase-spoonjoy">
            <Loop clip="spoonjoy-add-recipe" size="sm" />
            <div className="apple-showcase-copy">
              <p className="apple-door-kicker">Spoonjoy, on iPhone</p>
              <h3 id="showcase-spoonjoy" className="site-h3">
                Built for dinner.
              </h3>
              <p>
                A recipe app that cooks along with you. It took Ouro HX's spring and haptics for its kitchen, and Ouro AX's X-ray for its Siri tools and a cook-along skill.
              </p>
              <p className="apple-showcase-figure">
                <span className="apple-figure-from">{spoonjoy.before.summary.holding}</span>
                <span aria-hidden="true" className="apple-figure-arrow">
                  →
                </span>
                <span className="apple-figure-to">{spoonjoy.after.summary.holding}</span>
                <span className="apple-figure-label">
                  {claim("of its 29 App Intents claims hold, before and after its fixes.", {
                    source: { evidence: "site/src/apple/xray/spoonjoy.json" },
                    verify: [
                      { equals: "site/src/apple/xray/spoonjoy.json#before.summary.holding", is: 5 },
                      { equals: "site/src/apple/xray/spoonjoy.json#after.summary.holding", is: 12 },
                      { equals: "site/src/apple/xray/spoonjoy.json#after.summary.claims", is: 29 },
                    ],
                  })}
                </span>
              </p>
              <p className="apple-showcase-links">
                <a className="site-quiet-link" href="https://spoonjoy.app/">
                  Cook on the web today
                </a>
                <span aria-hidden="true"> · </span>
                <a className="site-quiet-link" href={href("/apple/ax/#xray")}>
                  Read its X-ray
                </a>
              </p>
            </div>
          </article>
          <article className="apple-showcase" aria-labelledby="showcase-ouro-md">
            <Loop clip="ouro-md-typing" size="sm" />
            <div className="apple-showcase-copy">
              <p className="apple-door-kicker">Ouro MD, on the Mac</p>
              <h3 id="showcase-ouro-md" className="site-h3">
                Built for words.
              </h3>
              <p>A Markdown app where you write in the rendered page. It took Ouro HX's tokens for its colours, and Ouro AX for its intents and its MCP door.</p>
              <p className="apple-showcase-figure">
                <span className="apple-figure-from">{ouroMd.before.summary.holding}</span>
                <span aria-hidden="true" className="apple-figure-arrow">
                  →
                </span>
                <span className="apple-figure-to">{ouroMd.after.summary.holding}</span>
                <span className="apple-figure-label">
                  {claim("of its App Intents claims hold, 29 checked before and 30 after, with none failing after.", {
                    source: { evidence: "site/src/apple/xray/ouro-md.json" },
                    verify: [
                      { equals: "site/src/apple/xray/ouro-md.json#before.summary.holding", is: 8 },
                      { equals: "site/src/apple/xray/ouro-md.json#before.summary.claims", is: 29 },
                      { equals: "site/src/apple/xray/ouro-md.json#after.summary.holding", is: 14 },
                      { equals: "site/src/apple/xray/ouro-md.json#after.summary.claims", is: 30 },
                      { equals: "site/src/apple/xray/ouro-md.json#after.summary.checks.fail", is: 0 },
                    ],
                  })}
                </span>
              </p>
              <p className="apple-showcase-links">
                <a className="site-quiet-link" href="https://ouro.bot/apps/ouro-md/">
                  Get Ouro MD for your Mac
                </a>
                <span aria-hidden="true"> · </span>
                <a className="site-quiet-link" href={href("/apple/ax/?app=ouro-md#xray")}>
                  Read its X-ray
                </a>
              </p>
            </div>
          </article>
        </div>
      </AppleBand>

      <LayersBand lede={<p>Ask the same app different questions, so neither people nor agents have to find out the hard way.</p>} />

      <Container className="apple-soon">
        <p className="site-eyebrow">Coming up</p>
        <p className="apple-soon-line">
          Components are in the workshop. They ship when a taste panel is properly delighted by them on an Apple screen, and not a spring sooner.
        </p>
        <p className="apple-fine">
          Ouro UI for Apple {kit.release} has the foundations and the X-ray.{" "}
          {kit.feelReinsRelease ? `Ouro Feel and Ouro Reins ship in ${kit.feelReinsRelease}.` : "Ouro Feel and Ouro Reins are on its main branch, and come with its next release."}
        </p>
      </Container>
      <NextPage current="/apple/" />
    </div>
  );
}
