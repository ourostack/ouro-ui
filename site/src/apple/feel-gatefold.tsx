import { useState, type CSSProperties, type JSX } from "react";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { href } from "../paths";
import gatefold from "./feel-gatefold.json";

/*
 * Ouro Feel's first real catch, before and after: Gatefold build 19's Fine-Tune panel on an iPad simulator in
 * portrait, and the report Feel's inside-the-window check wrote for each commit (evidence/gatefold-*.txt). The
 * captures are real; the book's text behind the panel is blurred, since the page is about the panel.
 */

type Side = "before" | "after";

const SHOWN = 4;
const SIDES: Side[] = ["before", "after"];

/** Where the panel sits in each 675×900 capture, as the blur crops left it unblurred. */
const RING: Record<Side, CSSProperties> = {
  before: { left: "85.9%", top: "60.2%", width: "14.1%", height: "38.4%" },
  after: { left: "24%", top: "60.2%", width: "52.1%", height: "38.4%" },
};

export function GatefoldFlip(): JSX.Element {
  const [side, setSide] = useState<Side>("before");
  const report = gatefold[side];
  return (
    <div className="feel-flip" data-feel-flip={side}>
      <SegmentedControl
        label="Gatefold build"
        items={[
          { value: "before", label: `Build 19 · ${gatefold.before.commit}` },
          { value: "after", label: `The fix · ${gatefold.after.commit}` },
        ]}
        value={side}
        onValueChange={(value) => setSide(value as Side)}
      />
      <div className="feel-flip-pair">
        <figure className="feel-flip-figure">
          {/* Both captures stay mounted and crossfade, so a flip never snaps; a ring marks where the panel is. */}
          <div className="feel-flip-screen">
            {SIDES.map((which) => (
              <div key={which} className="feel-flip-layer" data-shown={which === side ? "" : undefined} aria-hidden={which === side ? undefined : true}>
                <img
                  src={href(`/apple/media/feel-gatefold-${which}.jpg`)}
                  width={675}
                  height={900}
                  alt={
                    which === "before"
                      ? "Gatefold's Fine-Tune panel in portrait, pushed off the right edge of the iPad: only the start of its rows shows, and the switches are past the edge."
                      : "Gatefold's Fine-Tune panel in portrait after the fix, wholly on screen: fonts, line spacing, margins and the switches, back in reach."
                  }
                  loading="lazy"
                  decoding="async"
                />
                <span className="feel-flip-ring" style={RING[which]} aria-hidden="true">
                  <span className="feel-flip-ring-label">{which === "before" ? "the panel, mostly off-screen" : "the panel"}</span>
                </span>
              </div>
            ))}
          </div>
          <figcaption className="apple-loop-caption">
            <span>
              {claim("Captured from the iPad simulator, iOS 27.2, on the run the report came from.", {
                source: [{ evidence: "site/src/apple/evidence/gatefold-8ce5611-fail.txt" }, { evidence: "site/src/apple/evidence/gatefold-bd9356e-pass.txt" }],
                verify: [
                  { fileLine: "site/src/apple/evidence/gatefold-8ce5611-fail.txt", pattern: "w12-gatefold-ipad, iOS 27\\.2" },
                  { fileLine: "site/src/apple/evidence/gatefold-bd9356e-pass.txt", pattern: "w12-gatefold-ipad, iOS 27\\.2" },
                ],
              })}{" "}
              <span className="apple-loop-source">Gatefold at {report.commit}; the book behind the panel is blurred.</span>
            </span>
          </figcaption>
        </figure>
        {/* Both reports share one cell, so the section keeps its height when you flip; only the verdict is spoken. */}
        <p className="sr-only" aria-live="polite">
          {report.summary}
        </p>
        <div className="feel-flip-reports">
          {SIDES.map((which) => (
            <div key={which} className="feel-flip-report" data-shown={which === side ? "" : undefined} aria-hidden={which === side ? undefined : true}>
              <p className={which === "before" ? "feel-verdict feel-verdict-fail site-mono" : "feel-verdict feel-verdict-pass site-mono"}>{gatefold[which].summary}</p>
              {which === "before" ? (
                <ul className="feel-readings site-mono">
                  {gatefold.before.readings.slice(0, SHOWN).map((reading, index) => (
                    <li key={index}>{reading}</li>
                  ))}
                  <li className="feel-readings-more">…and {gatefold.before.readings.length - SHOWN} more like them, off past the window's right edge.</li>
                </ul>
              ) : null}
              <p className="feel-where site-mono">{gatefold[which].measured}</p>
              <p className="apple-fine">
                {which === "before"
                  ? "A person would just see a panel that looks a bit cramped. Feel read the controls' frames against the window, in portrait, landscape and portrait again, and found the switches had wandered off the edge of the world."
                  : "Same check, same simulator, one fix later, and the whole panel is back on the page. Flip back and forth; the panel doesn't have to be told twice."}{" "}
                <a className="apple-inline-link" href={href("/apple/feel/#genres")} tabIndex={which === side ? undefined : -1}>
                  Inside the window
                </a>{" "}
                is just one genre.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
