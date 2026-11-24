import { Fragment, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { InlineCode } from "../components/code";
import { StoryOpener } from "../components/story-world";
import { href, WINDOWS_PAGES } from "../paths";
import kits from "./kits.json";
import { Band, Capture, CI_FOOTNOTE, NextPage, SectionMenu } from "./shell";

const kit = kits.windows;

/** /windows/hx/: Ouro HX for Windows, the WinUI controls, where they follow Windows rather than the web, and what CI reads. */
export default function WindowsHx(): JSX.Element {
  return (
    <div id="windows-hx" className="apple platform-page">
      <SectionMenu label="Ouro UI for Windows" pages={WINDOWS_PAGES} current="/windows/hx/" />
      <StoryOpener scene="ouro-ui-windows" line="The robot taps a pane of the window, and it answers to its name." />
      <Hero
        layout="split"
        eyebrow="Ouro HX for Windows"
        title="Ouro's controls, made of WinUI."
        description={
          <div className="grid gap-3">
            <p>
              {claim("26 of core's components as WinUI 3 controls, built from core's specs and tokens.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
                verify: [
                  { count: "site/src/platforms/kits.json#windows.components", is: 26 },
                  { fileLine: "site/src/platforms/kits.json", pattern: "from core's specs \\(`vendor/core/components`\\) and tokens" },
                ],
              })}{" "}
              {claim("Each follows light and dark mode, a Windows contrast theme, the text size and the animation setting.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "Each follows light and dark mode, a Windows contrast theme, the text size and the animation setting" } })}
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
            <Button href={href("/windows/start/")}>Add the package</Button>
            <Button href={href("/windows/ax/")} variant="outline" tone="secondary">
              Meet the agent side
            </Button>
          </>
        }
        media={<Capture light="/windows/forms-light.webp" dark="/windows/forms-dark.webp" alt="Ouro Shop's Forms page on Windows: fields, a select and switches." note={CI_FOOTNOTE} source={kit.ciEvidence} width={800} height={567} />}
      />

      <Band
        id="windows-controls"
        eyebrow="The controls"
        title="From Button to Table."
        lede={
          <p>
            {claim("Here's every one the kit has, so far 26.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { count: "site/src/platforms/kits.json#windows.components", is: 26 } })}{" "}
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

      <Band id="windows-manners" eyebrow="Windows' own ways" title="They act like Windows controls, because they are.">
        <ul className="apple-quad">
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Switch</h3>
            <p className="apple-quad-body">
              {claim("A Button with the Toggle pattern, as WinUI's ToggleSwitch is. Its thumb stretches while pressed, but never with Windows animations off.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "Its thumb stretches while pressed, never with Windows animations off" } })}
            </p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Select</h3>
            <p className="apple-quad-body">
              {claim("A WinUI ComboBox, so its list opens as a flyout, and each option is 44 effective pixels tall.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "its list opens as a flyout and its options are 44 epx tall" } })}
            </p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Contrast themes</h3>
            <p className="apple-quad-body">
              {claim("Under a contrast theme the controls draw the person's system colours, as Windows asks, so status tones look alike there.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "Status tones then look alike, so their meaning must also be in words" } })} Say what a tone means in words too.
            </p>
          </li>
          <li className="apple-quad-item">
            <h3 className="apple-quad-title">Swipes and drags</h3>
            <p className="apple-quad-body">
              {claim("SwipeActions has a menu of every action and Reorderable a menu of moves, so a swipe or a drag is never the only way.", {
                source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
                verify: [
                  { fileLine: "site/src/platforms/kits.json", pattern: "so a swipe is never the only way" },
                  { fileLine: "site/src/platforms/kits.json", pattern: "so a drag is never the only way" },
                ],
              })}
            </p>
          </li>
        </ul>
      </Band>

      <Band
        id="windows-hx-checked"
        eyebrow="In CI"
        title="Read the way Windows reads it."
        lede={
          <p>
            {claim("CI installs the sample app and reads its window through UI Automation in light, dark, a contrast theme, with animations off and with text at 225%.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "with animations off and with text at 225%" } })}{" "}
            {claim("It checks every claim core makes for each component, and samples pixels against what each control says it drew.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
              verify: [
                { fileLine: "site/src/platforms/kits.json", pattern: "It checks every claim core makes for each component" },
                { fileLine: "site/src/platforms/kits.json", pattern: "samples pixels against what each control reports it drew" },
              ],
            })}{" "}
            {claim("Every tone and variant reads at 4.5:1 or better in all six themes, light and dark.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: { fileLine: "site/src/platforms/kits.json", pattern: "every tone and variant reads at 4\\.5:1 or better in all 6 themes, light and dark" } })}{" "}
            {claim("NVDA reads the tables page aloud, and the run measures launch time, memory and press latency.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
              verify: [
                { fileLine: "site/src/platforms/kits.json", pattern: "starts NVDA through Guidepup" },
                { fileLine: "site/src/platforms/kits.json", pattern: "measures launch time, memory and press latency" },
              ],
            })}
          </p>
        }
      >
        <Capture light="/windows/lists-light.webp" dark="/windows/lists-dark.webp" alt="Ouro Shop's Lists page on Windows." note={CI_FOOTNOTE} source={kit.ciEvidence} width={800} height={567} />
      </Band>
      <NextPage pages={WINDOWS_PAGES} current="/windows/hx/" />
    </div>
  );
}
