import type { JSX } from "react";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock, Command, InlineCode } from "../components/code";
import { StoryOpener } from "../components/story-world";
import { href, WINDOWS_PAGES } from "../paths";
import { Container } from "../voyage/layout";
import kits from "./kits.json";
import { Band, NextPage, SectionMenu } from "./shell";

const kit = kits.windows;


/** /windows/start/: the feed, the package, a first button with an action, and the agent's card, from the kit's README "Use it". */
export default function WindowsStart(): JSX.Element {
  return (
    <div id="windows-start" className="apple platform-page">
      <SectionMenu label="Ouro UI for Windows" pages={WINDOWS_PAGES} current="/windows/start/" />
      <StoryOpener scene="ouro-ui-windows" line="Pull up a chair by the window, and the controls move right in." />
      <Hero
        layout="column"
        eyebrow="Get started"
        title="Add it with dotnet."
        description={
          <div className="grid gap-3">
            <p>
              {claim("Each release publishes the packages to GitHub Packages, ourostack's NuGet feed, which asks for a sign-in even for public packages: a token with read:packages.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "a token with read:packages" }] })}{" "}
              <InlineCode>gh auth token</InlineCode> gives you one, after <InlineCode>gh auth refresh -s read:packages</InlineCode>.
            </p>
            <Command command={kit.feedLine} />
            <Command command={kit.packageLine} />
            <p className="apple-fine">
              {claim("Rather not sign in? Each release attaches its .nupkg files too, for a local feed.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "for a local feed with no sign-in" }] })}{" "}
              <a className="apple-inline-link" href={kit.releaseUrl}>
                Release {kit.release}
              </a>
            </p>
          </div>
        }
      />

      <Band
        id="first-button"
        eyebrow="Five minutes"
        title="A button that knows what it does."
        lede={
          <p>
            Declare your actions once in TypeScript with core&rsquo;s <InlineCode>defineAction</InlineCode>, then generate the Windows files. An{" "}
            <InlineCode>OuroButton</InlineCode> with an <InlineCode>Action</InlineCode> runs it through the same runtime an agent&rsquo;s call goes through.
          </p>
        }
      >
        <ol className="platform-steps">
          <li className="platform-step">
            <h3 className="site-h3 text-base">Generate the doors</h3>
            <Command command={kit.generateLine} />
            <p className="apple-fine">
              {claim("That writes OuroActions.g.cs (the catalog), app-actions.json (App Actions), mcpb.manifest.json (the MCP bundle for the Agent Registry) and doors.json (which door carries which action, and why not).", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
                verify: { count: "site/src/platforms/kits.json#windows.generated", is: 4 },
              })}
            </p>
          </li>
          <li className="platform-step">
            <h3 className="site-h3 text-base">Press it, or let an agent call it</h3>
            <CodeBlock code={kit.firstButton} label="MainWindow.xaml.cs" copy />
            <p className="apple-fine">
              {claim("A consequential action an agent prepared waits for the person's yes before it runs.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "a yes from the person before a consequential action an agent prepared" }] })}
            </p>
          </li>
          <li className="platform-step">
            <h3 className="site-h3 text-base">Draw an agent&rsquo;s card</h3>
            <p>
              Generate your catalog from your actions with core&rsquo;s <InlineCode>ouro-a2ui-catalog.mts catalog</InlineCode>, then give{" "}
              <InlineCode>OuroComposedSurface</InlineCode> the tool result.{" "}
              {claim("It draws Ouro's composed tree or A2UI messages, limited to your catalog.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "which draws an agent's card, as a composed tree or as A2UI messages" }] })}
            </p>
            <p className="apple-fine">
              An unpackaged app needs <InlineCode>&lt;EnableMsixTooling&gt;true&lt;/EnableMsixTooling&gt;</InlineCode> in its project, so the build writes its{" "}
              <InlineCode>resources.pri</InlineCode> and the controls&rsquo; templates&nbsp;load.
            </p>
          </li>
          <li className="platform-step">
            <h3 className="site-h3 text-base">Check what you installed</h3>
            <Command command={kit.attestLine} />
            <p className="apple-fine">{claim("The release workflow attests each file it attaches, so you can check a package was built from its tag.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "gives each file it attaches a GitHub build attestation" }] })}</p>
          </li>
        </ol>
      </Band>

      <Container className="apple-soon">
        <p className="apple-fine">
          The rest, from the controls&rsquo; manners to where Windows differs from the spec, is in the kit&rsquo;s{" "}
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
      <NextPage pages={WINDOWS_PAGES} current="/windows/start/" />
    </div>
  );
}
