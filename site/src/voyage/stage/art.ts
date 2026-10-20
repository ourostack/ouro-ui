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
