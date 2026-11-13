import type { JSX } from "react";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock, Command } from "../components/code";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import kit from "./kit.json";
import { Loop } from "./loop";
import { StoryOpener } from "../components/story-world";
import { AppleBand, AppleMenu, NextPage } from "./shell";

const FIRST_SCREEN = `import OuroHX

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView().ouroTheme(.pearl)
        }
    }
}

struct ContentView: View {
    @Environment(\\.ouroColors) private var colors
    @Environment(\\.ouroTheme) private var theme
    @State private var saved = false

    var body: some View {
        Button(saved ? "Saved" : "Save") { saved.toggle() }
            .foregroundStyle(colors.primaryForeground)
            .padding()
            .background(colors.primary, in: .rect(cornerRadius: theme.radius(.lg)))
            .buttonStyle(.ouroPress)
            .ouroAnimation(.spring, value: saved)
            .ouroHaptic(.checked, trigger: saved)
    }
}`;

const PRODUCTS = [
  { name: "OuroHX", body: "Themes, colours, the spring and curves, haptic moments and fold posture. For your app." },
  { name: "OuroHXTesting", body: "Snapshot tests in light, dark and Increase Contrast, and audit helpers. For your tests." },
  { name: "OuroAX", body: "Outcomes, problems and entity queries, in the shape Ouro AX gives them on the web too. For your app." },
  { name: "OuroAXTesting", body: "The X-ray's checks and reports, and Siri evaluation helpers. For your tests." },
  { name: "ouro-ax-xray", body: "The X-ray itself, for you and for CI." },
  { name: "ouro-ax-skills", body: "The skills linter, also as a build plugin." },
] as const;

/** /apple/start/: the package line, a first screen and the X-ray in CI. */
export default function AppleStart(): JSX.Element {
  return (
    <div id="apple-start" className="apple">
      <AppleMenu current="/apple/start/" />
      <StoryOpener scene="ouro-ui-apple" line="One bench, three screens, one Swift package. Pull up a seat." />
      <Hero
        layout="column"
        eyebrow="Get started"
        title="One line of Swift."
        description={
          <div className="grid gap-3">
            <p>Add the package in Xcode under File, Add Package Dependencies, or put this in your Package.swift:</p>
            <CodeBlock code={kit.packageLine} label="Package.swift" wrap copy />
            <p className="apple-fine">
              {claim("It needs iOS 18 or macOS 15 and Swift 6.1 tools; newer things like the folding hinge and Siri AI switch on by themselves where the OS has them.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Package.swift#L1-L9" },
                verify: [
                  { equals: "site/src/apple/kit.json#requires.iOS", is: "18" },
                  { equals: "site/src/apple/kit.json#requires.swiftTools", is: "6.1" },
                  { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/c9a84aff2ec71b92981d70595df3158f7ba2c4d0/Package.swift#L1-L9" },
                ],
              })}
            </p>
          </div>
        }
      />

      <AppleBand id="first-screen" eyebrow="Five minutes" title="Your first screen with manners." lede={<p>A theme at the root, then a button that presses, springs and taps from the shared table.</p>}>
        <div className="apple-pair">
          <Loop clip="hx-press" size="sm" caption="What that button does: dips, springs, and turns into Saved." />
          <CodeBlock code={FIRST_SCREEN} label="ContentView.swift" copy />
        </div>
      </AppleBand>

      <AppleBand id="box" eyebrow="In the box" title="What you can import.">
        <ul className="apple-products">
          {PRODUCTS.map((product) => (
            <li key={product.name} className="apple-product">
              <code className="apple-product-name">{product.name}</code>
              <span className="apple-product-body">{product.body}</span>
            </li>
          ))}
        </ul>
      </AppleBand>

      <AppleBand
        id="xray"
        eyebrow="In CI"
        title="Let CI do the X-raying."
        lede={<p>Build your app for the Simulator, then run the X-ray on it. Its exit code fails the job when a claim you care about slips.</p>}
      >
        <div className="apple-steps">
          <Command command={'swift run ouro-ax-xray --app path/to/App.app --commit "$(git rev-parse --short HEAD)" --out report'} />
          <p className="apple-fine">
            The behaviour stage runs your app's queries with AppIntentsTesting in a test bundle; the package's <code>scripts/xray-probe.sh</code> sets that up. For what only
            Siri can answer, write a scenario set and run it on a device with the 27.3 beta.
          </p>
        </div>
      </AppleBand>

      <AppleBand
        id="feel-reins"
        eyebrow="Coming next"
        title="Feel and Reins, for the brave."
        lede={
          <p>
            {kit.feelReinsRelease
              ? `Ouro Feel and Ouro Reins ship in ${kit.feelReinsRelease}.`
              : "Ouro Feel and Ouro Reins are on ouro-ui-apple's main branch, and come in a later release."}{" "}
            Until then the package line above doesn't include them; their pages show what they do.
          </p>
        }
      >
        <ul className="apple-products">
          <li className="apple-product">
            <a className="apple-inline-link" href={href("/apple/feel/")}>
              Ouro Feel
            </a>
            <span className="apple-product-body">Link OuroFeel into your UI test target and walk every screen.</span>
          </li>
          <li className="apple-product">
            <a className="apple-inline-link" href={href("/apple/reins/")}>
              Ouro Reins
            </a>
            <span className="apple-product-body">Link OuroReins into your app's UI-free core and drive it with ls and do.</span>
          </li>
        </ul>
      </AppleBand>

      <Container className="apple-soon">
        <p className="apple-fine">
          The package is{" "}
          <a className="apple-inline-link" href={kit.releaseUrl}>
            ouro-ui-apple {kit.release}
          </a>
          , with docs in its{" "}
          <a className="apple-inline-link" href={kit.repository}>
            README
          </a>
          .
        </p>
      </Container>
      <NextPage current="/apple/start/" />
    </div>
  );
}
