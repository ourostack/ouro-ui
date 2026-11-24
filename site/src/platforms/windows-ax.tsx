import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Command, InlineCode } from "../components/code";
import { StoryOpener } from "../components/story-world";
import { href, WINDOWS_PAGES } from "../paths";
import kits from "./kits.json";
import { Band, Capture, CI_FOOTNOTE, NextPage, SectionMenu } from "./shell";

const kit = kits.windows;

/** /windows/ax/: Ouro AX for Windows, App Actions and MCP from one declaration, the runtime behind them, and what the X-ray checks. */
export default function WindowsAx(): JSX.Element {
  return (
    <div id="windows-ax" className="apple platform-page">
      <SectionMenu label="Ouro UI for Windows" pages={WINDOWS_PAGES} current="/windows/ax/" />
      <StoryOpener scene="ouro-ui-windows" line="The robot asks the app what it can do, and gets the same list the person's buttons show." />
      <Hero
        layout="column"
        eyebrow="Ouro AX for Windows"
        title="Two doors, one declaration."
        description={
          <div className="grid gap-3">
            <p>
              Doors are the ways an agent gets in without a screen.{" "}
              {claim("On Windows they are App Actions and an MCP server for the On-device Agent Registry, generated from core's one defineAction declaration.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "Windows App Actions and an MCP server for the On-device Agent Registry\\), all generated from ouro-ui-core's one defineAction" } })}{" "}
              {claim("The sample app's installer registers both.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "The MSIX registers its App Actions and its MCP server" } })}
            </p>
            <p className="apple-fine">
              {claim("In release 0.12.1.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.12.1" },
                verify: { equals: "site/src/platforms/kits.json#windows.release", is: "0.12.1" },
              })}
            </p>
          </div>
        }
        actions={
          <>
            <Button href={href("/windows/start/#first-button")}>Generate the doors</Button>
            <Button href={href("/actions/")} variant="outline" tone="secondary">
              What an action is
            </Button>
          </>
        }
      />

      <Band
        id="windows-generate"
        eyebrow="Declare once"
        title="One command writes the doors."
        lede={
          <p>
            Declare your actions in TypeScript with core&rsquo;s <InlineCode>defineAction</InlineCode>, then run the generator.
          </p>
        }
      >
        <Command command={kit.generateLine} />
        <p className="apple-fine">
          {claim("That writes OuroActions.g.cs (the catalog), app-actions.json (App Actions), mcpb.manifest.json (the MCP bundle for the Agent Registry) and doors.json (which door carries which action, and why not).", {
            source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
            verify: { count: "site/src/platforms/kits.json#windows.generated", is: 4 },
          })}
        </p>
      </Band>

      <Band
        id="windows-runtime"
        eyebrow="One runtime"
        title="Behind the doors, one runtime."
        lede={
          <p>
            {claim("Ouro.Actions checks the input against the schema, keeps idempotency keys, audits every call, gets a yes from the person before a consequential action an agent prepared, and answers core's typed refusal for a person-only action at every agent door.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
              verify: { fileLine: "site/src/platforms/kits.json", pattern: "The runtime every door goes through: input checked against the schema, idempotency keys, an audit of every call" },
            })}{" "}
            {claim("The sample's MCP server is three lines, and an App Action launch hands its address to the same runtime.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "The MCP server is three lines .* passed to the same runtime" } })}{" "}
            A person pressing an <InlineCode>OuroButton</InlineCode> goes through it too.
          </p>
        }
      />

      <Band
        id="windows-xray"
        eyebrow="AX X-ray"
        title="Do agents and people see the same actions?"
        lede={
          <p>
            {claim("CI runs the X-ray on the installed sample app: it reads the window's UI Automation tree, the live MCP server's answers and the App Actions the package registered.", {
              source: [{ spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/tools/xray.mts" }],
              verify: [
                { fileLine: "site/src/platforms/kits.json", pattern: "runs the X-ray \\(`tools/xray\\.mts`\\) that agents and people see the same actions" },
                { fileLine: "site/src/platforms/kits.json", pattern: "It reads the window's UI Automation tree," },
                { fileLine: "site/src/platforms/kits.json", pattern: "the live MCP server's answers, the App Actions the installed package registered" },
              ],
            })}{" "}
            {claim("What each door should carry comes from core, so the X-ray and the generator can't disagree.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/tools/xray.mts" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "so the X-ray and the generator can't disagree about what a door carries" } })}{" "}
            {claim("Any disagreement fails the run.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/tools/xray.mts" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "Exit 1 when they disagree" } })}
          </p>
        }
      >
        <ul className="apple-quad">
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">People can press it</h3>
            <p className="apple-quad-body">
              {claim("Each declared action has a button with its label and description, and there's no button nobody declared.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/tools/xray.mts" },
                verify: [
                  { fileLine: "site/src/platforms/kits.json", pattern: "\"people press it\"" },
                  { fileLine: "site/src/platforms/kits.json", pattern: "\"no undeclared button\"" },
                ],
              })}
            </p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Person-only stays the person&rsquo;s</h3>
            <p className="apple-quad-body">
              {claim("An MCP call answers core's refusal, and an App Action launch is refused.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/tools/xray.mts" },
                verify: [
                  { fileLine: "site/src/platforms/kits.json", pattern: "\"MCP call answers core's refusal\"" },
                  { fileLine: "site/src/platforms/kits.json", pattern: "\"App Action launch refused\"" },
                ],
              })}
            </p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Consequential asks first</h3>
            <p className="apple-quad-body">
              {claim("An MCP call opens a dialog with No as the default, and the person's No means nothing ran.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/tools/xray.mts" },
                verify: [
                  { fileLine: "site/src/platforms/kits.json", pattern: "MCP call asks the person first \\(No is the default\\)" },
                  { fileLine: "site/src/platforms/kits.json", pattern: "\"person's No means nothing ran\"" },
                ],
              })}
            </p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">A retry runs once</h3>
            <p className="apple-quad-body">{claim("A second call with the same idempotency key doesn't run the action again.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/tools/xray.mts" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "\"a retry with the same key runs once\"" } })}</p>
          </li>
        </ul>
        <p className="platform-footnote">
          {claim("The runner is Windows Server, with no App Actions runtime, so CI proves both doors register and behave, and not yet that Windows lists them to agents.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "CI proves the package registers both doors and that they behave" }] })}{" "}
          {claim("A Windows 11 check would add the system's App Actions catalog, an agent calling through the registry, and Mica in the screenshots; it isn't in CI yet.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "A Windows 11 client check \\(build 26220\\.7262 or later\\) would add the system App Actions catalog" } })}
        </p>
      </Band>

      <Band
        id="windows-person-only"
        eyebrow="Still open"
        title="A person-only button, pressed by automation."
        lede={
          <p>
            {claim("UI Automation can press a person-only action's button, as it can any Windows button. Asking for Windows Hello first is built, and turned off.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "Person-only actions: UI Automation can press their buttons\\. Requiring Windows Hello first is built and off" } })}{" "}
            <a className="apple-inline-link" href="https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/docs/person-check.md">
              The open question
            </a>{" "}
            is whether to turn it on.
          </p>
        }
      />

      <Band
        id="windows-composed"
        eyebrow="Composed UI"
        title="An agent's card, with your buttons on it."
        lede={
          <p>
            {claim("OuroComposedSurface draws an agent's card, as Ouro's composed tree or as A2UI messages, and every button on it is one of your declared actions.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "which draws an agent's card, as a composed tree or as A2UI messages" }, { fileLine: "site/src/platforms/kits.json", pattern: "every button is one of your declared actions" }] })}{" "}
            <a className="apple-inline-link" href={href("/composed-ui/")}>
              How Composed UI works
            </a>
            .
          </p>
        }
      >
        <Capture light="/windows/composed.webp" dark="/windows/composed-contrast.webp" alt="Ouro Shop on Windows: an agent's card, This week's list, with a picture, badges, a description list, a to-pick-up list, a warning and a field to add something." note={CI_FOOTNOTE} source={kit.ciEvidence} width={992} height={726} />
      </Band>
      <NextPage pages={WINDOWS_PAGES} current="/windows/ax/" />
    </div>
  );
}
