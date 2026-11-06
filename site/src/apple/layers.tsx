import type { JSX, ReactNode } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { href } from "../paths";
import { AppleBand } from "./shell";
import "./layers.css";

/*
 * How Ouro UI for Apple's three ways of checking an app fit: the X-ray reads what it claims, Reins drives what it
 * does, Feel measures how that feels. Each Apple page that names one shows all three, with the page you're on marked.
 */

export const LAYERS = [
  { name: "X-ray", path: "/apple/ax/", asks: "Does it say what it does?", body: "Reads the built app's App Intents from outside and checks that its claims hold.", kind: "Claims held" },
  { name: "Reins", path: "/apple/reins/", asks: "Does it do it?", body: "Drives the screens as state and actions, headless, with the network blocked.", kind: "Behaviour" },
  { name: "Feel", path: "/apple/feel/", asks: "Does it feel right while it does?", body: "Walks the real app in a simulator and measures its jank, genre by genre.", kind: "How it feels" },
] as const;

export function Layers({ current }: { current?: (typeof LAYERS)[number]["path"] | undefined }): JSX.Element {
  return (
    <ol className="apple-layers">
      {LAYERS.map((layer, index) => (
        <li key={layer.name} className="apple-layer" data-current={layer.path === current ? "" : undefined}>
          <span className="apple-lane-step site-mono" aria-hidden="true">
            {index + 1}
          </span>
          <p className="apple-layer-kind">{layer.kind}</p>
          <h3 className="apple-layer-name">
            {layer.path === current ? (
              <>
                {layer.name} <span className="apple-layer-here">(this page)</span>
              </>
            ) : (
              <a className="apple-door-link" href={href(layer.path)}>
                {layer.name} <span aria-hidden="true">→</span>
              </a>
            )}
          </h3>
          <p className="apple-layer-asks">{layer.asks}</p>
          <p className="apple-layer-body">{layer.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** The band that shows the layers, on the overview, AX, Feel and Reins pages. */
export function LayersBand({ current, lede }: { current?: (typeof LAYERS)[number]["path"] | undefined; lede?: ReactNode }): JSX.Element {
  return (
    <AppleBand
      id="layers"
      eyebrow="Ways of knowing"
      title={claim("Three layers: claims, behaviour, and how it feels.", {
        source: { file: "site/src/apple/layers.tsx" },
        verify: { fileLine: "site/src/apple/layers.tsx", pattern: "^  \\{ name: \"Feel\"" },
      })}
      lede={lede}
    >
      <Layers current={current} />
    </AppleBand>
  );
}
