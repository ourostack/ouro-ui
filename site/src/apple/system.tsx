import type { JSX } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import actionClaims from "../../../scripts/parity-data/actions.claims.json";
import componentClaims from "../../../scripts/parity-data/components.claims.json";
import parity from "../../../scripts/parity-data/parity.json";
import provenance from "../../../scripts/parity-data/provenance.json";
import { cellText, componentRows, surfaceRows, totals } from "../../../scripts/parity-rows.mjs";
import { href } from "../paths";
import kit from "./kit.json";
import { AppleBand } from "./shell";

const CORE = `https://github.com/${provenance.coreRepo}`;

/** One row of the people-and-agents grid: what each platform has for it. */
const GRID = [
  {
    who: "People",
    name: "Ouro HX",
    web: "React components you copy into your app with the shadcn CLI.",
    apple: `SwiftUI: ${kit.components.join(", ")}, plus the spring, the press, haptics and six themes.`,
  },
  {
    who: "Agents",
    name: "Ouro AX",
    web: "A kit for command lines, HTTP APIs and MCP servers, and an X-ray that calls them from outside.",
    apple: "Typed outcomes for App Intents, an X-ray for an app's App Intents, and Ouro Reins to drive its screens.",
  },
  {
    who: "Both, from one declaration",
    name: "The one action model",
    web: "A command line, MCP and WebMCP tools and a web control.",
    apple: "An App Intent, a SwiftUI button and a Reins action.",
  },
] as const;

const names = (list: string[]): string => list.map((name) => name[0]!.toUpperCase() + name.slice(1)).join(", ");

/** Web and Apple as one system, with the parity tables core's own data generates (scripts/platform-parity.mjs writes the same rows into the Platforms page). */
export function SystemBand(): JSX.Element {
  const rows = componentRows(componentClaims);
  const sum = totals(rows);
  const surfaces = surfaceRows(actionClaims);
  return (
    <AppleBand
      id="apple-system"
      eyebrow="One system"
      title="People and agents, web and Apple."
      lede={
        <p>
          {claim("Ouro HX is for the people using an interface and Ouro AX is for the agents using it, and both have a web half and an Apple half.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/README.md" },
            verify: { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/README.md" },
          })}
        </p>
      }
    >
      <div className="apple-table-wrap" role="region" aria-label="What Ouro UI has for people and agents, on web and Apple" tabIndex={0}>
        <table className="apple-table">
          <caption className="sr-only">What Ouro UI has for people and for agents, on web and on Apple.</caption>
          <thead>
            <tr>
              <th scope="col">For</th>
              <th scope="col">Web</th>
              <th scope="col">Apple</th>
            </tr>
          </thead>
          <tbody>
            {GRID.map((row) => (
              <tr key={row.name}>
                <th scope="row">
                  {row.who}
                  <span className="apple-table-sub">{row.name}</span>
                </th>
                <td>{row.web}</td>
                <td>{row.apple}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="apple-fine">
        {claim("One declaration generates the command line, MCP, WebMCP, web control, App Intent, SwiftUI button and Reins surfaces, and core's check fails an app's CI when a generated file drifts from it.", {
          source: { spec: "https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/docs/guides/actions.md" },
          verify: [
            { equals: "scripts/parity-data/provenance.json#coreTag", is: "v0.5.0" },
            { count: "scripts/parity-data/actions.claims.json#claims", is: 5 },
            { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/docs/guides/actions.md" },
          ],
        })}{" "}
        Core {provenance.coreTag} has the generator, which an app copies in;{" "}
        <a className="apple-inline-link" href={`${CORE}/blob/${provenance.coreTag}/docs/guides/actions.md`}>
          the adopter guide
        </a>{" "}
        says how.
      </p>

      <p className="apple-fine" id="parity">
        Components: core's {sum.claims} promises about Button, Empty, Alert, Sheet and Toast, with the web test and the Apple test behind them. A cell that says Not yet or Partly marks a gap.
      </p>
      <div className="apple-table-wrap" role="region" aria-label="Component promises, web and Apple" tabIndex={0}>
        <table className="apple-table">
          <caption className="sr-only">Web and Apple checks for core's component promises.</caption>
          <thead>
            <tr>
              <th scope="col">Promise</th>
              <th scope="col">Applies to</th>
              <th scope="col">Web</th>
              <th scope="col">Apple</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <code className="apple-code">{row.id}</code>
                </th>
                <td>{names(row.appliesTo)}</td>
                <td data-state={row.web.state}>{cellText(row.web)}</td>
                <td data-state={row.apple.state}>{cellText(row.apple)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="apple-fine">Actions: the surfaces one declaration generates, and how many of core's {actionClaims.claims.length} action claims name them.</p>
      <div className="apple-table-wrap" role="region" aria-label="Action surfaces" tabIndex={0}>
        <table className="apple-table">
          <caption className="sr-only">Surfaces one declaration generates, and how many action claims name them.</caption>
          <thead>
            <tr>
              <th scope="col">Surface</th>
              <th scope="col">Platform</th>
              <th scope="col">Claims</th>
            </tr>
          </thead>
          <tbody>
            {surfaces.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td>{row.platform}</td>
                <td>{row.claims.length} of {actionClaims.claims.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="apple-fine">
        Generated from{" "}
        <a className="apple-inline-link" href={`${CORE}/releases/tag/${provenance.coreTag}`}>
          core {provenance.coreTag}
        </a>
        's claim files by <code className="apple-code">scripts/platform-parity.mjs</code>. Core also compares {Object.keys(parity.files).length} of its web files with web's {parity.webTag} files, byte for byte. The{" "}
        <a className="apple-inline-link" href={href("/docs/platforms/")}>
          Platforms page
        </a>{" "}
        has the version table.
      </p>
    </AppleBand>
  );
}
