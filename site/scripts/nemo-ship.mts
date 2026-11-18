// The ship in the "nemo" egg (site/src/voyage/eggs/nemo.ts): the Nautilus, cut out of the frosted-glass scene where she lies
// afloat by the shipyard (site/public/brand/storybook/scenes/nautilus-shipyard-afloat, day and night), so the ship that
// sails across the page is a painting from the same world as every other picture on it.
//
//   node site/scripts/nemo-ship.mts           checks every cut-out against its scene and mask
//   node site/scripts/nemo-ship.mts --write   cuts every ship and rewrites manifest.json
//
// Each mask is a path traced by hand around the hull, the wheelhouse and its dome, the mast and the deck lamp, in the
// scene's own pixels. Its edge is feathered inward only, so no cliff or sky is left around the hull, and below the
// waterline line the hull fades out over a few pixels, as a ship's side does where it meets the sea, so no wake or water
// comes with her.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
/** Where the cut-outs are written, from the repository root. */
export const OUT = "site/public/eggs";
/** The widths each ship is cut at, in pixels: the egg draws her at most 420px wide (eggs.css), so 840 covers a 2x screen. */
export const WIDTHS = [420, 840] as const;
const QUALITY = 82;

type Point = readonly [number, number];

/** A mask in the scene's own pixels: the hull's outline and the thin parts it would lose, the feather and the waterline. */
export interface Mask {
  /** The outline, stern to bow along the deck and back under the hull, as [x, y] points. */
  outline: readonly Point[];
  /** The mast: a thin upright box, [left, top, right, bottom]. */
  mast: readonly [number, number, number, number];
  /** The deck lamp: its centre and radius, [x, y, r]. */
  lamp: readonly [number, number, number];
  /** How soft the edge is: the blur's sigma, in the scene's pixels, kept inside the outline. */
  feather: number;
  /** The rows over which the hull fades out at the waterline: whole at `from`, gone at `to`. */
  waterline: { from: number; to: number };
}

export interface Ship {
  /** The file name stem: `nautilus-<id>-<width>.webp`. */
  id: "day" | "night";
  /** The scene, from the repository root. */
  source: string;
  mask: Mask;
}

const scene = (name: string) => `site/public/brand/storybook/scenes/${name}-3072.webp`;

/** The two ships: the day scene's for a light page, the night scene's, with her lamps lit, for a dark one. */
export const SHIPS: readonly Ship[] = [
  {
    id: "day",
    source: scene("nautilus-shipyard-afloat"),
    mask: {
      outline: [
        [1762, 836], [1766, 832], [1780, 830], [1793, 813], [1807, 805], [1825, 802], [1850, 795], [1875, 790], [1895, 783], [1910, 781],
        [1935, 775], [1962, 772], [1990, 769], [2017, 769], [2045, 765], [2072, 762], [2095, 760], [2128, 760], [2129, 751], [2142, 750],
        [2143, 700], [2148, 696], [2156, 694], [2204, 693], [2204, 679], [2209, 671], [2218, 666], [2240, 665], [2248, 670], [2252, 680],
        [2253, 692], [2280, 695], [2286, 707], [2283, 712], [2285, 727], [2282, 748], [2318, 752], [2320, 759], [2380, 762], [2420, 766],
        [2450, 771], [2465, 775], [2499, 781], [2527, 788], [2552, 797], [2570, 802], [2587, 810], [2602, 815], [2620, 818], [2640, 822],
        [2665, 823], [2652, 825], [2630, 826], [2610, 829], [2590, 834], [2580, 840], [2567, 850], [2552, 860], [2535, 867], [2515, 874],
        [2497, 880], [2497, 890], [1806, 890], [1801, 862], [1791, 847], [1770, 843],
      ],
      mast: [2181, 595, 2190, 694],
      lamp: [2120, 744, 7],
      feather: 1.2,
      waterline: { from: 852, to: 872 },
    },
  },
  {
    id: "night",
    source: scene("nautilus-shipyard-afloat-dark"),
    mask: {
      outline: [
        [1916, 884], [1922, 878], [1940, 871], [1955, 865], [1970, 860], [2000, 854], [2030, 848], [2050, 846], [2065, 843], [2085, 840],
        [2095, 837], [2127, 837], [2160, 834], [2195, 830], [2236, 828], [2238, 818], [2233, 808], [2232, 800], [2237, 791], [2245, 785], [2289, 785], [2289, 771],
        [2295, 766], [2300, 764], [2317, 764], [2322, 770], [2325, 785], [2350, 786], [2355, 795], [2351, 799], [2350, 824], [2382, 827],
        [2384, 831], [2440, 832], [2465, 836], [2490, 838], [2515, 843], [2545, 848], [2570, 852], [2600, 860], [2622, 866], [2640, 871],
        [2665, 874], [2691, 874], [2672, 876], [2650, 878], [2630, 883], [2622, 888], [2612, 895], [2600, 901], [2587, 906], [2587, 915],
        [1930, 915], [1918, 893],
      ],
      mast: [2267, 717, 2274, 786],
      lamp: [2218, 820, 4],
      feather: 1.2,
      waterline: { from: 894, to: 908 },
    },
  },
];

/** The box a mask is cut to: its outline, mast and lamp with a pixel to spare, down to where the hull has faded out. */
export function boxOf(mask: Mask): { left: number; top: number; width: number; height: number } {
  const [lampX, lampY, lampR] = mask.lamp;
  const xs = [...mask.outline.map(([x]) => x), mask.mast[0], mask.mast[2], lampX - lampR, lampX + lampR];
  const ys = [...mask.outline.map(([, y]) => y), mask.mast[1], lampY - lampR];
  const left = Math.floor(Math.min(...xs)) - 2;
  const top = Math.floor(Math.min(...ys)) - 2;
  return { left, top, width: Math.ceil(Math.max(...xs)) + 2 - left, height: mask.waterline.to + 1 - top };
}

/** The mask's shapes as an SVG the size of its box, white on black. */
function maskSvg(mask: Mask): Buffer {
  const { left, top, width, height } = boxOf(mask);
  const at = ([x, y]: Point) => `${x - left},${y - top}`;
  const [x1, y1, x2, y2] = mask.mast;
  const [lx, ly, lr] = mask.lamp;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/>` +
      `<g fill="white"><polygon points="${mask.outline.map(at).join(" ")}"/><rect x="${x1 - left}" y="${y1 - top}" width="${x2 - x1}" height="${y2 - y1}"/>` +
      `<circle cx="${lx - left}" cy="${ly - top}" r="${lr}"/><rect x="${lx - left - 1.5}" y="${ly - top}" width="3" height="${lr * 2 + 4}"/></g></svg>`,
  );
}

/** The mask's alpha, one byte a pixel over its box: feathered inward from the outline, and faded out at the waterline. */
export async function alphaOf(mask: Mask): Promise<{ data: Buffer; width: number; height: number }> {
  const { top, width, height } = boxOf(mask);
  const { data } = await sharp(maskSvg(mask)).extractChannel(0).blur(mask.feather).raw().toBuffer({ resolveWithObject: true });
  const { from, to } = mask.waterline;
  for (let y = 0; y < height; y++) {
    const row = y + top;
    const water = row <= from ? 1 : row >= to ? 0 : (to - row) / (to - from);
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      // The blur spreads the edge both ways; doubling past its middle keeps all of the feather inside the outline.
      data[index] = Math.round(Math.max(0, Math.min(255, data[index]! * 2 - 255)) * water);
    }
  }
  return { data, width, height };
}

export const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** The ship's file name at a width. */
export const fileName = (ship: Pick<Ship, "id">, width: number): string => `nautilus-${ship.id}-${width}.webp`;

/** Cuts one ship from its scene at a width, in memory, as a WebP with alpha. */
export async function cut(ship: Ship, width: number, root = repo): Promise<Buffer> {
  const box = boxOf(ship.mask);
  const alpha = await alphaOf(ship.mask);
  const rgb = await sharp(join(root, ship.source)).extract(box).removeAlpha().raw().toBuffer();
  const rgba = await sharp(rgb, { raw: { width: box.width, height: box.height, channels: 3 } })
    .joinChannel(alpha.data, { raw: { width: alpha.width, height: alpha.height, channels: 1 } })
    .raw()
    .toBuffer();
  return sharp(rgba, { raw: { width: box.width, height: box.height, channels: 4 } })
    .resize(width, null, { kernel: "lanczos3" })
    .webp({ quality: QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
}

/** The manifest's record of one ship: its scene's checksum, the box and mask it was cut with, and its files. */
export interface ManifestEntry extends Ship {
  sha256: string;
  box: ReturnType<typeof boxOf>;
  files: string[];
}

export interface Manifest {
  $comment: string;
  ships: ManifestEntry[];
}

const COMMENT =
  "The Nautilus the nemo egg sails (site/src/voyage/eggs/nemo.ts), cut from the frosted-glass shipyard scene by site/scripts/nemo-ship.mts: each mask is a hand-traced outline in the scene's pixels, feathered inward, with the hull fading out over the rows given at the waterline. Check: node site/scripts/nemo-ship.mts. Recut: node site/scripts/nemo-ship.mts --write.";

/** The manifest the ships should have, from the scenes as they are now. */
export function manifestFor(ships: readonly Ship[] = SHIPS, root = repo): Manifest {
  return {
    $comment: COMMENT,
    ships: ships.map((ship) => ({
      ...ship,
      sha256: sha256(readFileSync(join(root, ship.source))),
      box: boxOf(ship.mask),
      files: WIDTHS.map((width) => fileName(ship, width)),
    })),
  };
}

/** Cuts every ship and writes it with the manifest. */
export async function write(ships: readonly Ship[] = SHIPS, root = repo): Promise<Manifest> {
  const out = join(root, OUT);
  mkdirSync(out, { recursive: true });
  for (const ship of ships) for (const width of WIDTHS) writeFileSync(join(out, fileName(ship, width)), await cut(ship, width, root));
  const manifest = manifestFor(ships, root);
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Raw pixels with alpha, for comparing two encodings of the same cut-out. */
async function pixels(bytes: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * The mean difference per channel, alpha included, 0 to 255, between two pictures of the same size; Infinity when their
 * sizes differ. The same cut-out encoded by another build of libwebp lands well under 1.
 */
export async function difference(a: Buffer, b: Buffer): Promise<number> {
  const [x, y] = await Promise.all([pixels(a), pixels(b)]);
  if (x.width !== y.width || x.height !== y.height) return Infinity;
  let sum = 0;
  for (let index = 0; index < x.data.length; index++) sum += Math.abs(x.data[index]! - y.data[index]!);
  return sum / x.data.length;
}

/** How far a committed cut-out may be from a fresh cut before it counts as another picture. */
export const TOLERANCE = 1.5;

/** What is wrong with the committed ships: a missing file, a changed scene, a moved mask or a ship that is not its mask's. */
export async function problems(root = repo, ships: readonly Ship[] = SHIPS): Promise<string[]> {
  const found: string[] = [];
  const out = join(root, OUT);
  const manifestFile = join(out, "manifest.json");
  if (!existsSync(manifestFile)) return [`${OUT}/manifest.json is missing. Fix: node site/scripts/nemo-ship.mts --write`];
  const committed = JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
  const wanted = manifestFor(ships, root);
  for (const entry of wanted.ships) {
    const recorded = committed.ships.find((each) => each.id === entry.id);
    if (!recorded) {
      found.push(`${entry.id} is not in ${OUT}/manifest.json`);
      continue;
    }
    if (recorded.sha256 !== entry.sha256) found.push(`the ${entry.id} ship's scene ${entry.source} changed since she was cut (sha256 ${recorded.sha256} in the manifest, ${entry.sha256} now)`);
    if (JSON.stringify(recorded) !== JSON.stringify(entry)) found.push(`the ${entry.id} ship's manifest entry is not the script's`);
    for (const width of WIDTHS) {
      const file = join(out, fileName(entry, width));
      if (!existsSync(file)) {
        found.push(`${OUT}/${fileName(entry, width)} is missing`);
        continue;
      }
      const off = await difference(readFileSync(file), await cut(entry, width, root));
      if (!(off <= TOLERANCE)) found.push(`${OUT}/${fileName(entry, width)} is not ${entry.source} cut with its mask (off by ${off.toFixed(2)} per channel)`);
    }
  }
  for (const recorded of committed.ships) if (!wanted.ships.some((each) => each.id === recorded.id)) found.push(`${OUT}/manifest.json lists ${recorded.id}, which the script does not cut`);
  return found.map((line) => (line.includes("Fix:") ? line : `${line}. Fix: node site/scripts/nemo-ship.mts --write`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) {
    const manifest = await write();
    console.log(`Cut ${manifest.ships.length} ships into ${OUT}.`);
  } else {
    const found = await problems();
    for (const line of found) console.error(line);
    process.exitCode = found.length ? 1 : 0;
  }
}
