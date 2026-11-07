import type { JSX } from "react";
import anglerfish from "../nautilus/art/anglerfish.svg?raw";

/*
 * The Ouro AX for Apple hero's drawing: the Nautilus's own anglerfish (site/src/nautilus/art/anglerfish.svg, drawn for
 * this site) holding its lamp up to your app's manual, the page Siri reads. Coloured from the theme's variables
 * (apple.css), so every preset repaints it. Its lamp breathes in opacity only, and is still under reduced motion.
 */

/** The drawing's markup inside its <svg>, without its title and comments. */
const FISH = anglerfish
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/<title>[\s\S]*?<\/title>/, "")
  .replace(/<!--[\s\S]*?-->/g, "");

export function Angler(): JSX.Element {
  return (
    <div className="apple-angler" aria-hidden="true">
      <svg viewBox="0 0 320 230">
        <defs>
          <radialGradient id="apple-angler-light" cx="226" cy="122" r="150" gradientUnits="userSpaceOnUse">
            <stop offset="0" className="apple-angler-light-core" />
            <stop offset="0.55" className="apple-angler-light-mid" />
            <stop offset="1" className="apple-angler-light-edge" />
          </radialGradient>
        </defs>
        <g transform="rotate(-7 105 100)">
          <rect className="apple-angler-page" x="34" y="26" width="138" height="160" rx="10" />
          <rect className="apple-angler-title" x="52" y="46" width="72" height="9" rx="4.5" />
          <rect className="apple-angler-line" x="52" y="68" width="102" height="5" rx="2.5" />
          <rect className="apple-angler-line" x="52" y="80" width="88" height="5" rx="2.5" />
          <rect className="apple-angler-line" x="52" y="92" width="96" height="5" rx="2.5" />
          <circle className="apple-angler-tick" cx="56" cy="117" r="4.5" />
          <rect className="apple-angler-line" x="66" y="114.5" width="70" height="5" rx="2.5" />
          <circle className="apple-angler-tick" cx="56" cy="133" r="4.5" />
          <rect className="apple-angler-line" x="66" y="130.5" width="58" height="5" rx="2.5" />
          <circle className="apple-angler-tick apple-angler-tick-open" cx="56" cy="149" r="4.5" />
          <rect className="apple-angler-line" x="66" y="146.5" width="78" height="5" rx="2.5" />
        </g>
        <circle className="apple-angler-glow" cx="226" cy="122" r="150" fill="url(#apple-angler-light)" />
        <g transform="translate(148 109) scale(1.4)" dangerouslySetInnerHTML={{ __html: FISH }} />
        <circle className="apple-angler-lamp" cx="226.4" cy="121.6" r="9" />
      </svg>
    </div>
  );
}
