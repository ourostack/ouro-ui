import { Fragment, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { InlineCode } from "../components/code";
import { StoryOpener } from "../components/story-world";
import { ANDROID_PAGES, href } from "../paths";
import kits from "./kits.json";
import { Band, Capture, CI_FOOTNOTE, NextPage, SectionMenu } from "./shell";

const kit = kits.android;

/** /android/hx/: Ouro HX for Android, the composables and their theme, the overlays drawn without Material, and what CI checks. */
export default function AndroidHx(): JSX.Element {
  return (
    <div id="android-hx" className="apple platform-page">
      <SectionMenu label="Ouro UI for Android" pages={ANDROID_PAGES} current="/android/hx/" />
      <StoryOpener scene="ouro-ui-android" line="The robot gives a seedling phone a gentle tug, and checks the roots before the leaves." />
      <Hero
        layout="split"
        eyebrow="Ouro HX for Android"
        title="Grown in Compose, with Ouro's manners."
        description={
          <div className="grid gap-3">
            <p>
              {claim("26 of core's components as composables, with specs taken from core by hash, so only the drawing is written here.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" },
                verify: [
                  { count: "site/src/platforms/kits.json#android.components", is: 26 },
                  { fileLine: "site/src/platforms/kits.json", pattern: "component specs are vendored from core by hash, and only the rendering is written here" },
                ],
              })}{" "}
              {claim("OuroTheme brings core's six themes, light and dark, increased contrast and reduced motion, and the kit stays free of Material.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "six themes, light and dark, increased contrast, reduce motion" }, { fileLine: "site/src/platforms/kits.json", pattern: "the kit stays free of Material" }] })}
            </p>
            <p className="apple-fine">
              {claim("In release 0.12.0.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-android/releases/tag/v0.12.0" },
                verify: { equals: "site/src/platforms/kits.json#android.release", is: "0.12.0" },
              })}
            </p>
          </div>
        }
        actions={
          <>
            <Button href={href("/android/start/")}>Add the library</Button>
            <Button href={href("/android/ax/")} variant="outline" tone="secondary">
              Meet the agent side
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

      <Band
        id="android-controls"
        eyebrow="The composables"
        title="From Button to ConfirmDialog."
        lede={
          <p>
            {claim("Here's every one the kit has, so far 26.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { count: "site/src/platforms/kits.json#android.components", is: 26 } })}{" "}
            <a className="apple-inline-link" href={href("/hx/#coverage")}>
              See them beside the other platforms
            </a>
            .
          </p>
        }
      >
        <p className="apple-lede">
          {kit.components.map((name, index) => (
            <Fragment key={name}>
              {index > 0 && ", "}
              <InlineCode>Ouro{name}</InlineCode>
            </Fragment>
          ))}
        </p>
      </Band>

      <Band
        id="android-overlays"
        eyebrow="Overlays"
        title="Drawn from your theme, not from Material."
        lede={
          <p>
            {claim("OuroDialog, OuroSheet and OuroConfirmDialog are platform windows drawn from the theme, not Material's AlertDialog or ModalBottomSheet.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "platform windows drawn from the theme, not Material's `AlertDialog` or `ModalBottomSheet`" } })}{" "}
            {claim("Each has a pane title, a heading and the dismiss action.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "each has a pane title, a heading and the dismiss action" } })}
          </p>
        }
      />

      <Band
        id="android-hx-checked"
        eyebrow="In CI"
        title="Checked in the semantics tree, and in the pixels."
        lede={
          <p>
            {claim("CI checks core's claims for every component: names and roles in the semantics tree, 48 dp touch targets, reduced motion, text that reflows at 200%, and contrast in all six themes with pixels sampled.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "names and roles in the semantics tree, 48 dp touch targets, reduced motion, text that reflows at 200%, and contrast in all six themes with pixels sampled" } })}{" "}
            {claim("It also checks the snapshots in light, dark, increased contrast and 200% text.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "It also checks the snapshots in light, dark, increased contrast and 200% text" } })}{" "}
            {claim("TalkBack's own speech for Table is proven there too.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "TalkBack's own speech for Table is proven in CI's talkback job" }] })}
          </p>
        }
      >
        <p className="platform-footnote">
          {claim("Checked on Android emulators in CI, never on a real device. Got one? Collaborators are very welcome.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "checked on Android emulators in GitHub's CI, never on a real device" }] })}
        </p>
      </Band>
      <NextPage pages={ANDROID_PAGES} current="/android/hx/" />
    </div>
  );
}
