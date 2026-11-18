// The crew's faces (site/public/crew/): Captain Nemo, Professor Aronnax, Conseil and Ned Land, each a
// square crop of one figure in the frosted-glass Nautilus scenes the site already shows
// (site/public/brand/storybook/scenes/), so the crew's avatars come from the same world as the art.
//
//   node site/scripts/crew-portraits.mts           checks every face against its scene and box
//   node site/scripts/crew-portraits.mts --write   cuts every face and rewrites manifest.json
//
// The crops come from the day pictures only: a portrait doesn't change with the theme.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
/** Where the faces are written, from the repository root. */
export const OUT = "site/public/crew";
/** The widths each face is cut at, in pixels: 96 covers the largest avatar the site draws (40px) on a 2x screen, 192 on a 3x one and zoomed. */
export const WIDTHS = [96, 192] as const;
const QUALITY = 82;

/** A square in the source picture's own pixels. */
export interface Box {
  left: number;
  top: number;
  size: number;
}

export interface Portrait {
  /** The file name stem: `<id>-<width>.webp`. */
  id: string;
  /** The crew member's name, as CREW in site/src/voyage/chapters/copy.ts has it. */
  name: string;
  /** Who in the scene plays them. */
  figure: string;
  /** The scene, from the repository root. */
  source: string;
  box: Box;
}

const scene = (name: string) => `site/public/brand/storybook/scenes/${name}-3072.webp`;

/** Who plays whom: the head and shoulders of one figure each. */
export const PORTRAITS: readonly Portrait[] = [
  { id: "nemo", name: "Captain Nemo", figure: "the glass sailor in the navy pea coat, at the hatch", source: scene("nautilus"), box: { left: 1125, top: 92, size: 220 } },
  { id: "aronnax", name: "Professor Aronnax", figure: "the glass reader in the green velvet jacket, in the armchair", source: scene("nautilus-library"), box: { left: 617, top: 470, size: 440 } },
  { id: "conseil", name: "Conseil", figure: "the sea-blue robot in the striped scarf, at the globe", source: scene("nautilus-library"), box: { left: 1966, top: 786, size: 400 } },
  { id: "ned", name: "Ned Land", figure: "the sea-blue robot in the striped jersey and red cap, with the spyglass", source: scene("nautilus"), box: { left: 1542, top: 126, size: 210 } },
];

/** The manifest's record of one face: its scene's checksum, its box and its files. */
export interface ManifestEntry extends Portrait {
  sha256: string;
  files: string[];
}

export interface Manifest {
  portraits: ManifestEntry[];
}

export const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** The face's file name at a width. */
export const fileName = (portrait: Pick<Portrait, "id">, width: number): string => `${portrait.id}-${width}.webp`;

/** Cuts one face from its scene at a width, in memory. */
export async function cut(portrait: Portrait, width: number, root = repo): Promise<Buffer> {
  const { left, top, size } = portrait.box;
  return sharp(join(root, portrait.source))
    .extract({ left, top, width: size, height: size })
    .resize(width, width, { kernel: "lanczos3" })
    .webp({ quality: QUALITY, effort: 6, smartSubsample: true })
    .toBuffer();
}

/** The manifest the faces should have, from the scenes as they are now. */
export function manifestFor(portraits: readonly Portrait[] = PORTRAITS, root = repo): Manifest {
  return {
    portraits: portraits.map((portrait) => ({
      ...portrait,
      sha256: sha256(readFileSync(join(root, portrait.source))),
      files: WIDTHS.map((width) => fileName(portrait, width)),
    })),
  };
}

/** Cuts every face and writes it with the manifest. */
export async function write(portraits: readonly Portrait[] = PORTRAITS, root = repo): Promise<Manifest> {
  const out = join(root, OUT);
  mkdirSync(out, { recursive: true });
  for (const portrait of portraits) for (const width of WIDTHS) writeFileSync(join(out, fileName(portrait, width)), await cut(portrait, width, root));
  const manifest = manifestFor(portraits, root);
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Raw pixels, for comparing two encodings of the same crop. */
async function pixels(bytes: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * The mean difference per channel, 0 to 255, between two pictures of the same size; Infinity when
 * their sizes differ. The same crop encoded by another build of libwebp lands well under 1.
 */
export async function difference(a: Buffer, b: Buffer): Promise<number> {
  const [x, y] = await Promise.all([pixels(a), pixels(b)]);
  if (x.width !== y.width || x.height !== y.height) return Infinity;
  let sum = 0;
  for (let index = 0; index < x.data.length; index++) sum += Math.abs(x.data[index]! - y.data[index]!);
  return sum / x.data.length;
}

/** How far a committed face may be from a fresh cut of its box before it counts as another picture. */
export const TOLERANCE = 1.5;

/** What is wrong with the committed faces: a missing file, a changed scene, a moved box or a face that is not its box's. */
export async function problems(root = repo, portraits: readonly Portrait[] = PORTRAITS): Promise<string[]> {
  const found: string[] = [];
  const out = join(root, OUT);
  const manifestFile = join(out, "manifest.json");
  if (!existsSync(manifestFile)) return [`${OUT}/manifest.json is missing. Fix: node site/scripts/crew-portraits.mts --write`];
  const committed = JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
  const wanted = manifestFor(portraits, root);
  for (const entry of wanted.portraits) {
    const recorded = committed.portraits.find((each) => each.id === entry.id);
    if (!recorded) {
      found.push(`${entry.id} is not in ${OUT}/manifest.json`);
      continue;
    }
    if (recorded.sha256 !== entry.sha256) found.push(`${entry.id}'s scene ${entry.source} changed since its face was cut (sha256 ${recorded.sha256} in the manifest, ${entry.sha256} now)`);
    if (JSON.stringify(recorded) !== JSON.stringify(entry)) found.push(`${entry.id}'s manifest entry is not the script's`);
    for (const width of WIDTHS) {
      const file = join(out, fileName(entry, width));
      if (!existsSync(file)) {
        found.push(`${OUT}/${fileName(entry, width)} is missing`);
        continue;
      }
      const off = await difference(readFileSync(file), await cut(entry, width, root));
      if (!(off <= TOLERANCE)) found.push(`${OUT}/${fileName(entry, width)} is not ${entry.source} cut at ${JSON.stringify(entry.box)} (off by ${off.toFixed(2)} per channel)`);
    }
  }
  for (const recorded of committed.portraits) if (!wanted.portraits.some((each) => each.id === recorded.id)) found.push(`${OUT}/manifest.json lists ${recorded.id}, which the script does not cut`);
  return found.map((line) => (line.includes("Fix:") ? line : `${line}. Fix: node site/scripts/crew-portraits.mts --write`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) {
    const manifest = await write();
    console.log(`Cut ${manifest.portraits.length} faces into ${OUT}.`);
  } else {
    const found = await problems();
    for (const line of found) console.error(line);
    process.exitCode = found.length ? 1 : 0;
  }
}
