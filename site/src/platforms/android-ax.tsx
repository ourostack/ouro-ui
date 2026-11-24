import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Command, InlineCode } from "../components/code";
import { StoryOpener } from "../components/story-world";
import { ANDROID_PAGES, href } from "../paths";
import kits from "./kits.json";
import { Band, Capture, CI_FOOTNOTE, NextPage, SectionMenu } from "./shell";

const kit = kits.android;

/** /android/ax/: Ouro AX for Android, AppFunctions from one declaration, the person's yes, and what the X-ray checks on the emulator. */
export default function AndroidAx(): JSX.Element {
  return (
    <div id="android-ax" className="apple platform-page">
      <SectionMenu label="Ouro UI for Android" pages={ANDROID_PAGES} current="/android/ax/" />
      <StoryOpener scene="ouro-ui-android" line="An agent leans over the seed tray and asks nicely. The app checks with the gardener first." />
      <Hero
        layout="split"
        eyebrow="Ouro AX for Android"
        title="Your actions, called by agents."
        description={
          <div className="grid gap-3">
            <p>
              Doors are the ways an agent gets in without a screen.{" "}
              {claim("On Android the door is AppFunctions, from core's one defineAction declaration.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "AppFunctions for agents, both from ouro-ui-core's one defineAction declaration" } })}{" "}
              {claim("A consequential one never runs until the person says yes.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "never runs from an agent's AppFunction call until the person says yes" } })}
            </p>
            <p className="apple-fine">
              {claim("In release 0.12.0. AppFunctions need compileSdk 37 and AGP 9.1 or later.", {
                source: [{ spec: "https://github.com/ourostack/ouro-ui-android/releases/tag/v0.12.0" }, { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }],
                verify: [
                  { equals: "site/src/platforms/kits.json#android.release", is: "0.12.0" },
                  { equals: "site/src/platforms/kits.json#android.requires.compileSdk", is: 37 },
                  { equals: "site/src/platforms/kits.json#android.requires.agp", is: "9.1" },
                ],
              })}
            </p>
          </div>
        }
        actions={
          <>
            <Button href={href("/android/start/")}>Generate them</Button>
            <Button href={href("/actions/")} variant="outline" tone="secondary">
              What an action is
            </Button>
          </>
        }
        media={
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
        }
      />

      <Band
        id="android-generate"
        eyebrow="Declare once"
        title="One command writes the door."
        lede={
          <p>
            Declare your actions in TypeScript with core&rsquo;s <InlineCode>defineAction</InlineCode>, then run core&rsquo;s Android generator into your app&rsquo;s sources.
          </p>
        }
      >
        <Command command={kit.generateLine} />
        <p className="apple-fine">
          {claim("That writes OuroActions.kt, with an AppFunction for each action an agent may call and none for a person-only one, and doors.json, which says which door carries which action, and why not.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" },
            verify: { fileLine: "site/src/platforms/kits.json", pattern: "an AppFunction per action an agent may call, none for person-only\\) and `doors\\.json` \\(which door carries which action, and why not\\)" },
          })}
        </p>
      </Band>

      <Band
        id="android-runtime"
        eyebrow="One path"
        title="A press and a call take the same road."
        lede={
          <p>
            {claim("In ouro-actions, a person's press and an agent's AppFunction call take one path. A person-only action refuses agents with core's typed refusal.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "A person's press and an agent's AppFunction call take one path\\. A person-only action refuses agents with core's typed refusal" } })}
          </p>
        }
      />

      <Band
        id="android-confirm"
        eyebrow="The person's yes"
        title="The kit asks the person itself."
        lede={
          <p>
            {claim("Android has no system prompt to ask for an app, so ouro-actions asks itself, with a built-in confirmation an app can replace with its own.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" },
              verify: [
                { fileLine: "site/src/platforms/kits.json", pattern: "Android has no system prompt to ask for an app, so `ouro-actions` asks itself" },
                { fileLine: "site/src/platforms/kits.json", pattern: "which an app can replace with its own `confirm`" },
              ],
            })}{" "}
            {claim("Don't is the default button.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "Don't is the default button\\." } })}
          </p>
        }
      >
        <ul className="apple-quad">
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">App on screen</h3>
            <p className="apple-quad-body">{claim("The confirmation opens at once.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "the confirmation opens at once" } })}</p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">App in the background</h3>
            <p className="apple-quad-body">
              {claim("A notification asks, and tapping it opens the confirmation. It has no Allow and shows none of the values, so the person reads them first.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "Tapping it opens the confirmation\\. The notification has no Allow and shows none of the values" } })}
            </p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Nothing can ask</h3>
            <p className="apple-quad-body">
              {claim("With no notification permission and the app in the background, the call is refused with OuroNeedsPerson, which says how to fix it.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "nothing can ask, so the call is refused with `OuroNeedsPerson`" }, { fileLine: "site/src/platforms/kits.json", pattern: "whose message says why and how to fix it" }] })}
            </p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Nobody answers</h3>
            <p className="apple-quad-body">{claim("The call waits up to two minutes, then counts as no, and no runs nothing.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "the call suspends until the person answers or two minutes pass" }, { fileLine: "site/src/platforms/kits.json", pattern: "the timeout all mean no, and no runs nothing" }] })}</p>
          </li>
        </ul>
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
      </Band>

      <Band
        id="android-xray"
        eyebrow="AX X-ray"
        title="Do agents and people see the same actions?"
        lede={
          <p>
            {claim("CI runs the sample on an Android 17 emulator, and the X-ray compares what Android indexed against the declarations.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "the sample on an Android 17 emulator" }, { fileLine: "site/src/platforms/kits.json", pattern: "The X-ray compares what Android indexed against the declarations" }] })}{" "}
            {claim("What agents can call and what people can press both come from the app's declarations, and the X-ray checks they agree with them.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/f27522bb0dc12193f1051e1a31f3b94e7efa16fc/samples/shop/src/androidTest/kotlin/bot/ouro/shop/XRayTest.kt" },
              verify: [
                { fileLine: "site/src/platforms/kits.json", pattern: "what agents can call \\(the AppFunctions Android indexed for this app\\) and what people" },
                { fileLine: "site/src/platforms/kits.json", pattern: "both come from shopping\\.actions\\.mts, and they agree with it" },
              ],
            })}
          </p>
        }
      >
        <ul className="apple-quad">
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Agents get exactly what they may call</h3>
            <p className="apple-quad-body">{claim("The AppFunctions Android indexed are the declared actions an agent may call, no more and no fewer.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/f27522bb0dc12193f1051e1a31f3b94e7efa16fc/samples/shop/src/androidTest/kotlin/bot/ouro/shop/XRayTest.kt" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "agents_get_exactly_the_declared_actions_an_agent_may_call" } })}</p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Person-only stays the person&rsquo;s</h3>
            <p className="apple-quad-body">{claim("A person-only action has no AppFunction, and a typed refusal.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/f27522bb0dc12193f1051e1a31f3b94e7efa16fc/samples/shop/src/androidTest/kotlin/bot/ouro/shop/XRayTest.kt" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "a_person_only_action_has_no_appfunction_and_a_typed_refusal" } })}</p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Same handler</h3>
            <p className="apple-quad-body">{claim("An agent's add runs through the same handler a person's press does.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/f27522bb0dc12193f1051e1a31f3b94e7efa16fc/samples/shop/src/androidTest/kotlin/bot/ouro/shop/XRayTest.kt" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "an_agent_adds_through_the_same_handler_people_press" } })}</p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Buttons for people too</h3>
            <p className="apple-quad-body">{claim("People get a button for every declared action.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/f27522bb0dc12193f1051e1a31f3b94e7efa16fc/samples/shop/src/androidTest/kotlin/bot/ouro/shop/XRayTest.kt" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "people_get_a_button_for_every_declared_action" } })}</p>
          </li>
        </ul>
        <p className="platform-footnote">
          {claim("On CI's API 36 emulator image, Android indexed none of the sample's AppFunctions, so CI checks them on Android 17 (API 37).", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "On CI's API 36 emulator image Android indexed none of the sample's AppFunctions, so CI checks them on Android 17 \\(API 37\\)" } })}{" "}
          {claim("Checked on emulators only, never on a real device.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "checked on Android emulators in GitHub's CI, never on a real device" } })}
        </p>
      </Band>
      <NextPage pages={ANDROID_PAGES} current="/android/ax/" />
    </div>
  );
}
