import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { StoryOpener } from "../components/story-world";
import { ANDROID_PAGES, href } from "../paths";
import { Container } from "../voyage/layout";
import kits from "./kits.json";
import { Band, Capture, CI_FOOTNOTE, NextPage, SectionMenu } from "./shell";

const kit = kits.android;


/** /android/: Ouro UI for Android, its two halves, what CI proves on the emulator, and the way to start. */
export default function AndroidHome(): JSX.Element {
  return (
    <div id="android-home" className="apple">
      <SectionMenu label="Ouro UI for Android" pages={ANDROID_PAGES} current="/android/" />
      <StoryOpener scene="ouro-ui-android" line="In the orchard, phones grow on trees. The robot picks one and checks it twice." />
      <Hero
        layout="split"
        eyebrow="Ouro UI for Android"
        title="Same manners, now in Compose."
        description={
          <div className="grid gap-3">
            <p>
              {claim("26 components in Jetpack Compose, and AppFunctions for agents, from the same declaration.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" },
                verify: [
                  { count: "site/src/platforms/kits.json#android.components", is: 26 },
                  { testExists: "site/src/platforms/platforms.test.tsx::platform pages > every component the Android page counts is a composable in the parity matrix" },
                  { fileLine: "site/src/platforms/kits.json", pattern: "AppFunctions for agents, both from ouro-ui-core's one defineAction declaration" },
                ],
              })}{" "}
              {claim("Every pull request checks what a screen reader hears, 48 dp touch targets, 200% text and contrast, and calls the AppFunctions on an Android emulator.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "names and roles in the semantics tree, 48 dp touch targets, reduced motion, text that reflows at 200%, and contrast" }, { fileLine: "site/src/platforms/kits.json", pattern: "the sample on an Android 17 emulator" }] })}{" "}
              They&rsquo;re composables, so they sit in your own screens beside anything you write yourself.
            </p>
            <p className="apple-fine">
              {claim("Release 0.12.0, from ourostack's Maven repository.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-android/releases/tag/v0.12.0" },
                verify: { equals: "site/src/platforms/kits.json#android.release", is: "0.12.0" },
              })}
            </p>
          </div>
        }
        actions={
          <>
            <Button href={href("/android/start/")}>Add the library</Button>
            <Button href={href("/hx/#coverage")} variant="outline" tone="secondary">
              See what it has
            </Button>
          </>
        }
        media={
          <Capture
            light="/android/gallery-light.webp"
            dark="/android/gallery-dark.webp"
            alt="The Ouro HX gallery on an Android emulator: the button tones and variants, badges, a Pantry card with an Edit button, and list items."
            note={CI_FOOTNOTE}
            source={kit.ciEvidence}
            width={1080}
            height={2400}
            phone
          />
        }
      />

      <Band id="android-halves" eyebrow="Two halves" title="One for the thumb, one for the agent.">
        <ul className="apple-doors">
          <li className="apple-door">
            <p className="apple-door-kicker">Ouro HX for Android</p>
            <h3 className="site-h3">The composables</h3>
            <p className="apple-door-body">
              {claim("OuroTheme brings core's six themes, light and dark, increased contrast and reduced motion, and the kit stays free of Material.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "six themes, light and dark, increased contrast, reduce motion" }, { fileLine: "site/src/platforms/kits.json", pattern: "the kit stays free of Material" }] })}
            </p>
          </li>
          <li className="apple-door">
            <p className="apple-door-kicker">Ouro AX for Android</p>
            <h3 className="site-h3">The doors</h3>
            <p className="apple-door-body">
              Doors are the ways an agent gets in without a screen.{" "}
              {claim("Here they are AppFunctions, and a consequential one never runs until the person says yes.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "never runs from an agent's AppFunction call until the person says yes" }] })}
            </p>
          </li>
          <li className="apple-door">
            <p className="apple-door-kicker">Composed UI</p>
            <h3 className="site-h3">The agent&rsquo;s card</h3>
            <p className="apple-door-body">{claim("OuroComposedSurface draws an agent's card, from Ouro's tree or A2UI.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "OuroComposedSurface draws an agent's card, as Ouro's composed tree or as A2UI messages" }] })}</p>
          </li>
        </ul>
      </Band>

      <Band
        id="android-checked"
        eyebrow="In CI"
        title="Checked on the emulator, not on a hunch."
        lede={
          <p>
            {claim("CI runs the sample on an Android 17 emulator: the X-ray compares what Android indexed against the declarations, and the agent's card is pressed button by button.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "the sample on an Android 17 emulator" }, { fileLine: "site/src/platforms/kits.json", pattern: "The X-ray compares what Android indexed against the declarations" }] })}{" "}
            {claim("TalkBack's own speech for Table is proven there too.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "TalkBack's own speech for Table is proven in CI's talkback job" }] })}
          </p>
        }
      >
        <ul className="platform-gallery">
          <li>
            <h3 className="platform-gallery-title">An agent&rsquo;s card</h3>
            <p className="platform-gallery-body">Pasta night, composed by an agent, drawn by the kit. Share asks first.</p>
            <Capture
              light="/android/composed-light.webp"
              dark="/android/composed-dark.webp"
              alt="An agent's card on Android, Pasta night: badges, what's missing, a tip about basil, fields to add an item, and Add to list and Share list buttons."
              note={CI_FOOTNOTE}
              source={kit.ciEvidence}
              width={1080}
              height={2400}
            phone
            />
          </li>
          <li>
            <h3 className="platform-gallery-title">The agent console</h3>
            <p className="platform-gallery-body">The app calls its own AppFunctions, as an assistant would: one ran, one is waiting for the person.</p>
            <Capture
              light="/android/agent-console.webp"
              dark="/android/agent-console.webp"
              alt="The sample's agent console on Android: an AppFunction search, an add that ran, and a share waiting for the person to answer."
              note={CI_FOOTNOTE}
              source={kit.ciEvidence}
              width={1080}
              height={2400}
            phone
            />
          </li>
        </ul>
        <p className="platform-footnote">
          {claim("Checked on Android emulators in CI, never on a real device. Got one? Collaborators are very welcome.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "checked on Android emulators in GitHub's CI, never on a real device" }] })}
        </p>
      </Band>

      <Container className="apple-soon">
        <p className="site-eyebrow">Where it stands</p>
        <p className="apple-soon-line">
          {claim("Ouro UI for Android 0.12.0 has 26 components, AppFunctions with the person's yes built in, and agent cards drawn natively.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" },
            verify: [
              { equals: "site/src/platforms/kits.json#android.release", is: "0.12.0" },
              { count: "site/src/platforms/kits.json#android.components", is: 26 },
            ],
          })}{" "}
          <a className="apple-inline-link" href={href("/hx/#coverage")}>
            See which ones, beside every other platform.
          </a>
        </p>
        <p className="apple-fine">
          <a className="apple-inline-link" href={kit.releaseUrl}>
            ouro-ui-android {kit.release}
          </a>
          , with docs in its{" "}
          <a className="apple-inline-link" href={kit.repository}>
            README
          </a>
          .
        </p>
      </Container>
      <NextPage pages={ANDROID_PAGES} current="/android/" />
    </div>
  );
}
