import anglerfish from "../../nautilus/art/anglerfish.svg?raw";
import jellyfish from "../../nautilus/art/jellyfish.svg?raw";
import kelp from "../../nautilus/art/kelp.svg?raw";
import lanternfish from "../../nautilus/art/lanternfish.svg?raw";
import nautilus from "../../nautilus/art/nautilus.svg?raw";
import octopus from "../../nautilus/art/octopus.svg?raw";
import ray from "../../nautilus/art/ray.svg?raw";
import sardine from "../../nautilus/art/sardine.svg?raw";
import seabed from "../../nautilus/art/seabed.svg?raw";

/** One drawing from site/src/nautilus/art: its viewBox and the markup inside its <svg>, without title or comments. */
export interface Art {
  viewBox: string;
  width: number;
  height: number;
  inner: string;
}

/** Splits a drawing into what the scene nests: the stage draws each at a size and place of its own. */
export function parseArt(source: string): Art {
  const open = /<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>/.exec(source);
  if (!open) throw new Error("A drawing needs an <svg> with a viewBox");
  const [, , width, height] = open[1]!.split(/\s+/).map(Number);
  const inner = source
    .slice(open.index + open[0].length, source.lastIndexOf("</svg>"))
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/\n\s*/g, "");
  return { viewBox: open[1]!, width: width!, height: height!, inner };
}

/**
 * The markup of a drawing's parts with one of these classes, in the drawing's order: a part is an
 * element of its own (`<circle class="c-glow" … />`) or a group (`<g class="n-lights">…</g>`, with
 * no group inside it). The stage draws a part again over its drawing, as a box of its own, where it
 * glows or blinks: the compositor fades a box without the page.
 */
export function partsOf({ inner }: Art, ...classes: string[]): string {
  const named = classes.join("|");
  const part = new RegExp(`<g\\b[^>]*\\bclass="(?:${named})"[^>]*>[\\s\\S]*?</g>|<\\w+\\b[^>]*\\bclass="(?:${named})"[^>]*/>`, "g");
  const parts = inner.match(part);
  if (!parts) throw new Error(`The drawing has no part named ${classes.join(" or ")}`);
  return parts.join("");
}

export const art = {
  anglerfish: parseArt(anglerfish),
  jellyfish: parseArt(jellyfish),
  kelp: parseArt(kelp),
  lanternfish: parseArt(lanternfish),
  nautilus: parseArt(nautilus),
  octopus: parseArt(octopus),
  ray: parseArt(ray),
  sardine: parseArt(sardine),
  seabed: parseArt(seabed),
};
