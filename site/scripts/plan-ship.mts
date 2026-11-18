// The painting Chapter I's plan becomes at the launch (chapter-one.tsx, `Plan`): the opener scene, the Nautilus
// surfaced in profile with her bow to the right, as the plan draws her, cropped to the plan's 3:1 band. Nothing is
// painted here: the crop comes from the scene files ourostack/.github's art pipeline made (site/public/brand/storybook,
// synced byte for byte), by day and at night.
//
//   node site/scripts/plan-ship.mts   writes site/public/plan-ship/: each scheme at each width as AVIF and WebP, and
//                                     manifest.json with each source file, its sha256, the box and each file's sha256
//
// plan-ship.test.mjs derives the crop again and compares it with the committed files, so a changed scene or box fails
// until this script is run again.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type Sharp } from "sharp";

export const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
/** Where the files go, and the path the page reads them from. */
export const OUT = "site/public/plan-ship";
export const PUBLIC_PATH = "/plan-ship/";
/** The scene files the crop is cut from, by day and at night (the same composition). */
export const SOURCES = {
  day: "site/public/brand/storybook/scenes/nautilus-3072.webp",
  night: "site/public/brand/storybook/scenes/nautilus-dark-3072.webp",
} as const;
/**
 * The crop, in the 3072 by 1024 scene's pixels: 3:1, the plan's own shape (its viewBox is 720 by 240). It keeps the
 * whole hull from the deck to the keel and the crew on deck, and trims the open sea past her bow.
 */
export const BOX = { left: 0, top: 32, width: 2880, height: 960 } as const;
/** The plan is at most 790px wide (a 1440px screen) and a phone's full width: 720 for 1x and a phone's 2x, 1440 above. */
export const WIDTHS = [720, 1440] as const;
export const FORMATS = ["avif", "webp"] as const;
const QUALITY = { avif: 60, webp: 72 } as const;

export type Scheme = keyof typeof SOURCES;
export type Format = (typeof FORMATS)[number];

/** A file's name: `nautilus-afloat-720.avif`, `nautilus-afloat-dark-1440.webp`. */
export function fileName(scheme: Scheme, width: number, format: Format): string {
  return `nautilus-afloat${scheme === "night" ? "-dark" : ""}-${width}.${format}`;
}

export const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** The crop of a scheme's scene at `width`, before encoding. */
export function crop(scheme: Scheme, width: number): Sharp {
  return sharp(join(repo, SOURCES[scheme])).extract(BOX).resize({ width, height: Math.round((width * BOX.height) / BOX.width) });
}

export interface Manifest {
  box: typeof BOX;
  sources: Record<Scheme, { file: string; sha256: string }>;
  files: { file: string; scheme: Scheme; width: number; height: number; format: Format; sha256: string }[];
}

/** Writes every file and the manifest. */
export async function write(): Promise<Manifest> {
  const out = join(repo, OUT);
  mkdirSync(out, { recursive: true });
  const manifest: Manifest = {
    box: BOX,
    sources: {
      day: { file: SOURCES.day, sha256: sha256(readFileSync(join(repo, SOURCES.day))) },
      night: { file: SOURCES.night, sha256: sha256(readFileSync(join(repo, SOURCES.night))) },
    },
    files: [],
  };
  for (const scheme of Object.keys(SOURCES) as Scheme[]) {
    for (const width of WIDTHS) {
      for (const format of FORMATS) {
        const file = fileName(scheme, width, format);
        const bytes = await crop(scheme, width).toFormat(format, { quality: QUALITY[format] }).toBuffer();
        writeFileSync(join(out, file), bytes);
        const { height } = await sharp(bytes).metadata();
        manifest.files.push({ file, scheme, width, height: height!, format, sha256: sha256(bytes) });
      }
    }
  }
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files } = await write();
  for (const each of files) console.log(`${OUT}/${each.file}  ${each.width}x${each.height}`);
}
