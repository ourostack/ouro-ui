import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock } from "../components/code";
import { href } from "../paths";
import { HapticTable } from "./haptics";
import { Loop } from "./loop";
import { StoryOpener } from "../components/story-world";
import { AppleBand, AppleMenu, NextPage } from "./shell";
import { PressTwin } from "./press-twin";
import { SpringTwin } from "./spring-twin";

const SPRING_CODE = `withOuroAnimation(.spring, reduceMotion: reduceMotion) {
    saved.toggle()
}

// or let a value drive it
Tile().ouroAnimation(.spring, value: saved)`;

const PRESS_CODE = `Button(saved ? "Saved" : "Save") { saved.toggle() }
    .buttonStyle(.ouroPress)
    .ouroHaptic(.checked, trigger: saved)`;

const THEME_CODE = `ContentView()
    .ouroTheme(.pearl)

// anywhere below
@Environment(\\.ouroColors) private var colors`;

/** /apple/hx/: the foundations of Ouro HX for Apple, each as a real capture beside a web twin you can touch. */
export default function AppleHx(): JSX.Element {
  return (
    <div id="apple-hx" className="apple">
      <AppleMenu current="/apple/hx/" />
      <StoryOpener scene="ouro-ui-apple" line="Press the green card on the phone, then on the laptop. Same spring, same little click." />
      <Hero
        layout="column"
        eyebrow="Ouro HX for Apple"
        title="Feel it before you read about it."
        description={
          <>
            {claim("The foundations ship today in 0.2.1: one spring, one press, eight named haptic moments and six themes.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.2.1" },
              verify: [
                { urlOk: "https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.2.1" },
                { equals: "site/src/apple/kit.json#release", is: "0.2.1" },
                { count: "site/src/apple/kit.json#haptics", is: 8 },
                { count: "site/src/apple/kit.json#themes", is: 6 },
              ],
            })}{" "}
            The clips below are the real SwiftUI, captured. The twins beside them run the same idea in your browser, so you can poke it.
          </>
        }
        actions={
          <>
            <Button href="#spring">Poke the spring</Button>
            <Button href={href("/apple/start/")} variant="outline" tone="secondary">
              Add the package
            </Button>
          </>
        }
        media={<Loop clip="hx-haptics" size="md" />}
      />

      <AppleBand
        id="spring"
        eyebrow="Motion"
        title="A spring with a temperament."
        lede={
          <p>
            {claim("Nearly everything that moves uses core's one spring: a 0.4-second response with a bounce of 0.15.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-core/blob/fdbbd24ecb91929f4a090552db3b66d4a51a90a3/tokens/ouro.tokens.json" },
              verify: [
                { equals: "site/src/apple/kit.json#spring.visualDuration", is: 0.4 },
                { equals: "site/src/apple/kit.json#spring.bounce", is: 0.15 },
                { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/fdbbd24ecb91929f4a090552db3b66d4a51a90a3/tokens/ouro.tokens.json" },
              ],
            })}{" "}
            Springs don't have an end time, they have a temperament, so you can grab one halfway and send it somewhere else and it keeps its speed.
          </p>
        }
      >
        <div className="apple-pair">
          <Loop clip="hx-spring" />
          <div className="apple-pair-side">
            <SpringTwin />
            <CodeBlock code={SPRING_CODE} label="In SwiftUI" />
          </div>
        </div>
      </AppleBand>

      <AppleBand
        id="reduce-motion"
        eyebrow="Reduce Motion"
        title="A crossfade, not a trip."
        lede={
          <p>
            {claim("With Reduce Motion on, every kind of motion becomes a 0.2-second crossfade, and a press stops shrinking.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Sources/OuroHX/Motion/OuroMotion.swift#L43-L47" },
              verify: [{ equals: "site/src/apple/kit.json#reducedMotionCrossfade", is: 0.2 }, { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Sources/OuroHX/Motion/OuroMotion.swift#L43-L47" }],
            })}{" "}
            You don't write that rule; the package's modifiers follow it for you. The twin above has the same switch.
          </p>
        }
      >
        <div className="apple-pair apple-pair-quiet">
          <Loop clip="hx-reduce-motion" size="sm" />
        </div>
      </AppleBand>

      <AppleBand
        id="press"
        eyebrow="Press"
        title="A press you can feel with your eyes."
        lede={
          <p>
            {claim("A pressed control shrinks to 0.97 of its size over 0.16 seconds, on the web and in Swift alike.", {
              source: [{ spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Sources/OuroHX/Tokens/OuroTokens.swift#L243" }, { file: "registry/ouro/theme/ouro-base.css" }],
              verify: [
                { equals: "site/src/apple/kit.json#press.scale", is: 0.97 },
                { fileLine: "registry/ouro/theme/ouro-base.css", pattern: "--ouro-press-scale: 0\\.97;" },
                { fileLine: "registry/ouro/theme/ouro-base.css", pattern: "--ouro-duration-press: 160ms;" },
              ],
            })}{" "}
            The buttons on this page are Ouro HX for the web, so they're twins already. The tart below has one; press it and hold.
          </p>
        }
      >
        <div className="apple-pair">
          <Loop clip="hx-press" />
          <div className="apple-pair-side">
            <PressTwin />
            <CodeBlock code={PRESS_CODE} label="In SwiftUI" />
          </div>
        </div>
      </AppleBand>

      <AppleBand
        id="haptics"
        eyebrow="Haptics"
        title="Eight moments, one table."
        lede={
          <p>
            Haptics are named for the moment, not the motor, so the same thing taps the same way on whichever screen it happens. Press a moment to see its taps, and switch on soft clicks to hear them.
          </p>
        }
      >
        <HapticTable />
      </AppleBand>

      <AppleBand
        id="colour"
        eyebrow="Colour"
        title="Themes, and the maths to keep them legible."
        lede={
          <p>
            {claim("The six themes are the same ones that repaint this website: Pearl, Abyss, Brass, Chart, Cookbook and Coral.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Sources/OuroHX/Tokens/OuroTokens.swift#L9-L14" },
              verify: { equals: "site/src/apple/kit.json#themes.5", is: "coral" },
            })}{" "}
            Open the theme picker up top and repaint the whole ship. OuroColor checks contrast for you and picks a readable label for any fill, in light, dark and Increase Contrast.
          </p>
        }
      >
        <div className="apple-pair">
          <Loop clip="hx-themes" />
          <div className="apple-pair-side">
            <CodeBlock code={THEME_CODE} label="In SwiftUI" />
            <p className="apple-fine">
              And on a phone that folds, OuroFoldPosture tells you whether it's open like a book, half-open on the table like a tiny laptop, or shut.
            </p>
          </div>
        </div>
      </AppleBand>
      <AppleBand
        id="measured"
        eyebrow="Measured"
        title="Then Ouro Feel checks it stays that way."
        lede={
          <p>
            A spring that feels lovely today can pick up a snap, a jump or a ghost copy tomorrow. Ouro Feel walks your app from a UI test and measures jank genre by
            genre, so the manners on this page survive the next refactor.{" "}
            <a className="apple-inline-link" href={href("/apple/feel/")}>
              Meet Ouro Feel
            </a>
            , and duel a switch with a tap lock while you're there.
          </p>
        }
      />
      <NextPage current="/apple/hx/" />
    </div>
  );
}
