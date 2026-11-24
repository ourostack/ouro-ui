import type { JSX } from "react";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock, Command, InlineCode } from "../components/code";
import { StoryOpener } from "../components/story-world";
import { ANDROID_PAGES, href } from "../paths";
import { Container } from "../voyage/layout";
import kits from "./kits.json";
import { Band, NextPage, SectionMenu } from "./shell";

const kit = kits.android;


/** /android/start/: the Maven repository, the library, a first button, and the person's yes, from the kit's README "Use it". */
export default function AndroidStart(): JSX.Element {
  return (
    <div id="android-start" className="apple">
      <SectionMenu label="Ouro UI for Android" pages={ANDROID_PAGES} current="/android/start/" />
      <StoryOpener scene="ouro-ui-android" line="Grab a basket. One repository line and one dependency, and the first phone is ripe." />
      <Hero
        layout="column"
        eyebrow="Get started"
        title="Add it in Gradle."
        description={
          <div className="grid gap-3">
            <p>Add ourostack&rsquo;s Maven repository beside Google&rsquo;s and Maven Central, then the library:</p>
            <CodeBlock code={kit.settings} label="settings.gradle.kts" wrap copy />
            <CodeBlock code={kit.packageLine} label="build.gradle.kts" wrap copy />
            <p className="apple-fine">
              {claim("Release 0.12.0.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-android/releases/tag/v0.12.0" },
                verify: [
                  { equals: "site/src/platforms/kits.json#android.release", is: "0.12.0" },
                  { fileLine: "site/src/platforms/kits.json", pattern: "bot\\.ouro\\.ui:ouro-hx:0\\.12\\.0" },
                ],
              })}{" "}
              <a className="apple-inline-link" href={kit.releaseUrl}>
                Its release notes
              </a>
            </p>
          </div>
        }
      />

      <Band id="first-button" eyebrow="Five minutes" title="Your first screen with manners." lede={<p>A theme at the root, then a button in the primary tone.</p>}>
        <CodeBlock code={kit.firstButton} label="MainActivity.kt" copy />
      </Band>

      <Band
        id="agents"
        eyebrow="For agents"
        title="Give agents your actions."
        lede={
          <p>
            Declare them once, as the sample&rsquo;s <InlineCode>shopping.actions.mts</InlineCode> does, then run core&rsquo;s generator into your app&rsquo;s sources.{" "}
            {claim("AppFunctions need compileSdk 37 and AGP 9.1 or later.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "AppFunctions need compileSdk 37 and AGP 9\\.1 or later" }] })}
          </p>
        }
      >
        <ol className="platform-steps">
          <li className="platform-step">
            <h3 className="site-h3 text-base">Generate the AppFunctions</h3>
            <p>
              Take <InlineCode>ouro-actions.mts</InlineCode> and <InlineCode>ouro-actions-android.mts</InlineCode> from a{" "}
              <a className="apple-inline-link" href="https://github.com/ourostack/ouro-ui-core/releases">
                core release
              </a>{" "}
              into one folder, then run:
            </p>
            <Command command={kit.generateLine} />
            <p className="apple-fine">
              Declare the generated <InlineCode>&lt;Set&gt;AppFunctionService</InlineCode> in your manifest, as the sample&rsquo;s does.
            </p>
          </li>
          <li className="platform-step">
            <h3 className="site-h3 text-base">Ask the person first</h3>
            <p>
              {claim("A consequential call, one that reaches other people, never runs until the person says yes.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "never runs from an agent's AppFunction call until the person says yes" }] })} Install
              the built-in confirmation once, after you bind your handlers:
            </p>
            <CodeBlock code={kit.confirmInstall} label="MyApp.kt" copy />
          </li>
          <li className="platform-step">
            <h3 className="site-h3 text-base">Check what you installed</h3>
            <Command command={kit.attestLine} />
            <p className="apple-fine">{claim("The release workflow attests each file it attaches, so you can check a library was built from its tag.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "gives each file it attaches a GitHub build attestation, so you can check that a library" }] })}</p>
          </li>
        </ol>
      </Band>

      <Container className="apple-soon">
        <p className="apple-fine">
          Drawing an agent&rsquo;s card, the confirmation in depth and what CI proves live in the kit&rsquo;s{" "}
          <a className="apple-inline-link" href={kit.repository}>
            README
          </a>
          . What it has beside the other platforms is on{" "}
          <a className="apple-inline-link" href={href("/hx/#coverage")}>
            Ouro HX&rsquo;s coverage
          </a>
          .
        </p>
      </Container>
      <NextPage pages={ANDROID_PAGES} current="/android/start/" />
    </div>
  );
}
