import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { StoryOpener } from "../components/story-world";
import { href, WINDOWS_PAGES } from "../paths";
import { Container } from "../voyage/layout";
import kits from "./kits.json";
import { Band, Capture, CI_FOOTNOTE, NextPage, SectionMenu } from "./shell";

const kit = kits.windows;


const TOUR = [
  { page: "forms", title: "Forms", body: "Field, Select and Switch, with their errors said in words." },
  { page: "lists", title: "Lists", body: "ItemGroup, SwipeActions, Reorderable and\u00a0ConversationList." },
  { page: "nav", title: "Navigation", body: "Sidebar, open and folded into a rail." },
  { page: "overlays", title: "Overlays", body: "Dialog and Sheet, with a close you can reach." },
] as const;

/** /windows/: Ouro UI for Windows, its two halves, what every pull request proves, and the way to start. */
export default function WindowsHome(): JSX.Element {
  return (
    <div id="windows-home" className="apple platform-page">
      <SectionMenu label="Ouro UI for Windows" pages={WINDOWS_PAGES} current="/windows/" />
      <StoryOpener scene="ouro-ui-windows" line="A cabin, a desk, a window that swings open. The robot checked: the panes have names." />
      <Hero
        layout="split"
        eyebrow="Ouro UI for Windows"
        title="Same manners, now in WinUI."
        description={
          <div className="grid gap-3">
            <p>
              {claim("26 components in WinUI 3, and App Actions and MCP for agents, from the same declaration.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
                verify: [
                  { count: "site/src/platforms/kits.json#windows.components", is: 26 },
                  { testExists: "site/src/platforms/platforms.test.tsx::platform pages > every component the Windows page counts is a control in the parity matrix" },
                ],
              })}{" "}
              {claim("Every pull request reads each one through UI Automation, has NVDA read the tables, and presses an agent's card as a person would.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "reads the window through UI Automation" }, { fileLine: "site/src/platforms/kits.json", pattern: "starts NVDA through Guidepup" }, { fileLine: "site/src/platforms/kits.json", pattern: "presses it as a person would" }] })}{" "}
              They're WinUI controls, so they sit in your own XAML beside anything you write yourself.
            </p>
            <p className="apple-fine">
              {claim("Release 0.12.1, from ourostack's NuGet feed.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.12.1" },
                verify: { equals: "site/src/platforms/kits.json#windows.release", is: "0.12.1" },
              })}
            </p>
          </div>
        }
        actions={
          <>
            <Button href={href("/windows/start/")}>Add the package</Button>
            <Button href={href("/hx/#coverage")} variant="outline" tone="secondary">
              See what it has
            </Button>
          </>
        }
        media={<Capture light="/windows/composed.webp" dark="/windows/composed-contrast.webp" alt="Ouro Shop on Windows: an agent's card, This week's list, with a picture, badges, a description list, a to-pick-up list, a warning and a field to add something." note={CI_FOOTNOTE} source={kit.ciEvidence} width={992} height={726} />}
      />

      <Band id="windows-halves" eyebrow="Two halves" title="One for the person, one for the agent.">
        <ul className="apple-doors">
          <li className="apple-door">
            <p className="apple-door-kicker">Ouro HX for Windows</p>
            <h3 className="site-h3">The controls</h3>
            <p className="apple-door-body">
              {claim("Button to Table, each following light and dark, a Windows contrast theme, the text size and the animation setting.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "Each follows light and dark mode, a Windows contrast theme, the text size and the animation setting" }] })}
            </p>
          </li>
          <li className="apple-door">
            <p className="apple-door-kicker">Ouro AX for Windows</p>
            <h3 className="site-h3">The doors</h3>
            <p className="apple-door-body">
              Doors are the ways an agent gets in without a screen.{" "}
              {claim("Here they are Windows App Actions and an MCP server for the On-device Agent Registry, generated from core's one defineAction\u00a0declaration.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "Windows App Actions and an MCP server for the On-device Agent Registry\\), all generated from ouro-ui-core's one defineAction" }] })}
            </p>
          </li>
          <li className="apple-door">
            <p className="apple-door-kicker">Composed UI</p>
            <h3 className="site-h3">The agent's card</h3>
            <p className="apple-door-body">
              {claim("OuroComposedSurface draws an agent's card, as Ouro's composed tree or as A2UI messages, and every button on it is one of your declared actions.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "which draws an agent's card, as a composed tree or as A2UI messages" }, { fileLine: "site/src/platforms/kits.json", pattern: "every button is one of your declared actions" }] })}
            </p>
          </li>
        </ul>
      </Band>

      <Band
        id="windows-checked"
        eyebrow="In CI"
        title="Checked the way Windows reads it."
        lede={
          <p>
            {claim("CI installs the app and reads the window through UI Automation in light, dark, a contrast theme, with animations off and with text at 225%.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "with animations off and with text at 225%" }] })}{" "}
            Here's the tour it takes.
          </p>
        }
      >
        <ul className="platform-gallery">
          {TOUR.map((stop) => (
            <li key={stop.page}>
              <h3 className="platform-gallery-title">{stop.title}</h3>
              <p className="platform-gallery-body">{stop.body}</p>
              <Capture
                light={`/windows/${stop.page}-light.webp`}
                dark={`/windows/${stop.page}-dark.webp`}
                alt={`Ouro Shop's ${stop.title} page on Windows.`}
                note={CI_FOOTNOTE}
                source={kit.ciEvidence}
                width={800}
                height={567}
              />
            </li>
          ))}
        </ul>
        <p className="platform-footnote">
          {claim("The runner is Windows Server, with no App Actions runtime, so CI proves both doors register and behave, and not yet that Windows lists them to agents.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "CI proves the package registers both doors and that they behave" }] })}
        </p>
      </Band>

      <Container className="apple-soon">
        <p className="site-eyebrow">Where it stands</p>
        <p className="apple-soon-line">
          {claim("Ouro UI for Windows 0.12.1 has 26 components, both agent doors and agent cards drawn natively.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
            verify: [
              { equals: "site/src/platforms/kits.json#windows.release", is: "0.12.1" },
              { count: "site/src/platforms/kits.json#windows.components", is: 26 },
            ],
          })}{" "}
          <a className="apple-inline-link" href={href("/hx/#coverage")}>
            See which ones, beside every other platform.
          </a>
        </p>
        <p className="apple-fine">
          <a className="apple-inline-link" href={kit.releaseUrl}>
            ouro-ui-windows {kit.release}
          </a>
          , with docs in its{" "}
          <a className="apple-inline-link" href={kit.repository}>
            README
          </a>
          .
        </p>
      </Container>
      <NextPage pages={WINDOWS_PAGES} current="/windows/" />
    </div>
  );
}
