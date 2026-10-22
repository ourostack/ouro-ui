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

/** How far a label's box reaches either side of its anchor, and above its baseline, in the drawing's units. */
const LABEL_REACH = 200;
const LABEL_RISE = 20;

/**
 * Where a label sits, as the box of a `<foreignObject>` holding it as HTML: the anchor point is an
 * SVG text's x and y (its baseline), and `anchor` its `text-anchor`. The HTML inside is one line
 * (line height 1, `labelStyle`) whose baseline falls on y, about 0.8em below the line's top.
 */
export function labelBox(x: number, y: number, anchor: string): { x: number; y: number; width: number; height: number; align: "left" | "center" | "right" } {
  return {
    x: anchor === "middle" ? x - LABEL_REACH : anchor === "end" ? x - 2 * LABEL_REACH : x,
    y: y - LABEL_RISE,
    width: 2 * LABEL_REACH,
    height: LABEL_RISE * 1.5,
    align: anchor === "middle" ? "center" : anchor === "end" ? "right" : "left",
  };
}

/** The style of the line inside a label's box. */
export const labelStyle = { paddingTop: `calc(${LABEL_RISE}px - 0.8em)`, lineHeight: 1, whiteSpace: "nowrap" } as const;

/**
 * A drawing's labels as HTML in a `<foreignObject>`, not SVG `<text>`. In WebKit any SVG text
 * rendered on the page makes every press of the pointer lay out and repaint the whole page, about
 * 300 ms on CI against 3 ms with none (measured for pull request 153). A label keeps its place
 * (labelBox), its size and spacing (its own `font-size` and `letter-spacing`, or its group's, which
 * HTML inherits), its class and its colour: `currentColor`, as the drawings' labels are.
 */
export function htmlLabels(inner: string): string {
  return inner.replace(/<text\b([^>]*)>([^<]*)<\/text>/g, (_, attributes: string, content: string) => {
    const read = (name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1];
    const box = labelBox(Number(read("x") ?? 0), Number(read("y") ?? 0), read("text-anchor") ?? "start");
    const kept = ["class", "font-size", "letter-spacing", "opacity"].map((name) => (read(name) === undefined ? "" : ` ${name}="${read(name)}"`)).join("");
    const style = `padding-top:${labelStyle.paddingTop};line-height:${labelStyle.lineHeight};white-space:${labelStyle.whiteSpace};text-align:${box.align}`;
    return `<foreignObject x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"${kept}><div style="${style}">${content}</div></foreignObject>`;
  });
}

/** Splits a drawing into what the scene nests: the stage draws each at a size and place of its own. Its labels are HTML (htmlLabels). */
export function parseArt(source: string): Art {
  const open = /<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>/.exec(source);
  if (!open) throw new Error("A drawing needs an <svg> with a viewBox");
  const [, , width, height] = open[1]!.split(/\s+/).map(Number);
  const inner = source
    .slice(open.index + open[0].length, source.lastIndexOf("</svg>"))
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/\n\s*/g, "");
  return { viewBox: open[1]!, width: width!, height: height!, inner: htmlLabels(inner) };
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
  if (!parts) throw new Error(`The drawing is missing its ${classes.join(" or ")}`);
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
