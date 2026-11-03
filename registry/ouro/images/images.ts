export { FORMATS, main, makeImages, parseArgs, planWidths, WIDTHS };
export type { Format, ImageEntry, ImagesOptions, ImagesResult, Manifest };

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Ouro images: each raster picture in a folder as AVIF and WebP at each width up to its own, and images.json with the
// srcset of each, so a page draws a picture sharp at every screen size without sending a phone the widest file.
//
//   node lib/ouro/images/images.ts <source folder> [--out <folder>] [--widths 320,640,…] [--formats avif,webp]
//        [--base <url prefix>] [--quality <1-100>]
//
// A picture's files are kept when images.json says they were made from the same bytes and options, and they are all
// there. Exit 0 when every picture was written, kept or left out, 1 when one could not be written, 2 for a usage
// problem.

type Format = "avif" | "webp";

interface Source {
  type: string;
  srcset: string;
}

interface ImageEntry {
  width: number;
  height: number;
  src: string;
  sources: Source[];
  /** What the files were made from: the picture's bytes, the widths, formats and quality, and sharp's version. */
  made: string;
}

type Manifest = Record<string, ImageEntry>;

interface ImagesOptions {
  source: string;
  out: string;
  widths?: number[];
  formats?: Format[];
  base?: string;
  quality?: number;
  log?: (line: string) => void;
}

interface ImagesResult {
  manifest: Manifest;
  written: number;
  kept: number;
  failed: string[];
  skipped: string[];
}

const WIDTHS = [320, 640, 960, 1280, 1920, 2560, 3840, 5120];
const FORMATS: Format[] = ["avif", "webp"];
const TYPES: Record<Format, string> = { avif: "image/avif", webp: "image/webp" };
const RASTER = /\.(png|jpe?g|webp|avif|tiff?)$/i;

// The widths to write for a picture `width` pixels wide: each of `widths` narrower than it, then its own.
const planWidths = (width: number, widths: number[]) => [...new Set([...widths.filter((w) => w < width), width])].sort((a, b) => a - b);

// Writes each picture under `source` into `out` at each width and format, turned upright as its EXIF orientation says,
// and `out`/images.json. Hidden folders, node_modules and an `out` inside `source` are left out, and so is an animated
// picture, which would lose its frames.
async function makeImages({ source, out, widths = WIDTHS, formats = FORMATS, base = "", quality = 70, log = console.log }: ImagesOptions): Promise<ImagesResult> {
  const root = resolve(source);
  const outDir = resolve(out);
  // Only an out folder inside the source holds files to leave out; a source inside the out folder is all source.
  const outside = (file: string) => !outDir.startsWith(root + sep) || !file.startsWith(outDir + sep);
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && RASTER.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => outside(file) && !relative(root, file).split(sep).some((part) => part.startsWith(".") || part === "node_modules"))
    .sort();
  const result: ImagesResult = { manifest: {}, written: 0, kept: 0, failed: [], skipped: [] };
  // The last run's manifest: a picture's files are up to date when they were made from the same bytes and options, and
  // are all still there. A file's time says nothing: a picture moved in from a download keeps an older one.
  const earlier = (await readFile(join(outDir, "images.json"), "utf8").then(JSON.parse, () => ({}))) as Partial<Manifest>;
  const writers = new Map<string, string>();
  for (const file of files) {
    const name = relative(root, file).split(sep).join("/");
    const stem = name.replace(/\.[^.]+$/, "");
    const other = writers.get(stem);
    if (other !== undefined) {
      result.failed.push(`${name}: it would write the same files as ${other}; rename one of them`);
      continue;
    }
    writers.set(stem, name);
    // An address in a srcset ends at a space, and at a # or ? it would start a fragment or a query, so each folder and
    // file name in it is percent-encoded.
    const address = (written: string) => `${base}${written.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const { autoOrient, pages = 1 } = await sharp(file).metadata();
      if (pages > 1) {
        result.skipped.push(`${name}: animated, and its frames would be lost; serve it as it is`);
        continue;
      }
      const { width, height } = autoOrient;
      const planned = planWidths(width, widths);
      const made = createHash("sha256")
        .update(await readFile(file))
        .update(JSON.stringify({ planned, formats, quality, sharp: sharp.versions }))
        .digest("hex");
      const outputs = formats.flatMap((format) => planned.map((w) => join(outDir, `${stem}-${w}.${format}`)));
      const fresh = earlier[name]?.made === made && (await Promise.all(outputs.map((target) => stat(target).then(() => true, () => false)))).every(Boolean);
      const entry: ImageEntry = { width, height, src: address(`${stem}-${width}.${formats.at(-1)}`), sources: [], made };
      for (const format of formats) {
        const set: string[] = [];
        for (const w of planned) {
          const written = `${stem}-${w}.${format}`;
          const target = join(outDir, written);
          if (fresh) result.kept++;
          else {
            await mkdir(dirname(target), { recursive: true });
            await sharp(file).autoOrient().resize({ width: w }).toFormat(format, { quality }).toFile(target);
            result.written++;
          }
          set.push(`${address(written)} ${w}w`);
        }
        entry.sources.push({ type: TYPES[format], srcset: set.join(", ") });
      }
      result.manifest[name] = entry;
      log(`${name}: ${width}×${height} at ${planned.join(", ")} wide, as ${formats.join(" and ")}`);
    } catch (problem) {
      // A header that reads can still hide a picture that does not: a truncated file fails only once it is decoded.
      result.failed.push(`${name}: ${(problem as Error).message}`);
    }
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "images.json"), `${JSON.stringify(result.manifest, null, 2)}\n`);
  return result;
}

interface Args {
  source?: string;
  out: string;
  widths: number[];
  formats: Format[];
  base: string;
  quality: number;
  help: boolean;
}

const USAGE = `Usage: node lib/ouro/images/images.ts <source folder> [options]

Writes each raster picture in the folder as AVIF and WebP at each width up to its own, and images.json with the
srcset of each, for a <picture> element.

  --out <folder>        where the pictures and images.json go (default public/images)
  --widths 320,640,…    the widths to write below each picture's own (default 320,640,960,1280,1920,2560,3840,5120)
  --formats avif,webp   the formats, the fallback last (default avif,webp)
  --base <prefix>       what each address in a srcset starts with, such as /images/ (default none)
  --quality <1-100>     the encoder's quality (default 70)`;

// The command line, or the usage problem as a thrown Error.
function parseArgs(argv: string[]): Args {
  const args: Args = { out: "public/images", widths: WIDTHS, formats: FORMATS, base: "", quality: 70, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const next = argv[++i];
      if (next === undefined || next.startsWith("--")) throw new Error(`${arg} needs a value.`);
      return next;
    };
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--out") args.out = value();
    else if (arg === "--base") args.base = value();
    else if (arg === "--widths") {
      const text = value();
      args.widths = text.split(",").map(Number);
      if (args.widths.some((w) => !Number.isInteger(w) || w < 1)) throw new Error(`--widths takes whole numbers of pixels, such as 320,640, not "${text}".`);
    } else if (arg === "--formats") {
      const text = value();
      args.formats = text.split(",").map((f) => f.trim()) as Format[];
      if (args.formats.some((f) => !FORMATS.includes(f))) throw new Error(`--formats takes avif, webp or both, not "${text}".`);
    } else if (arg === "--quality") {
      const text = value();
      args.quality = Number(text);
      if (!Number.isInteger(args.quality) || args.quality < 1 || args.quality > 100) throw new Error(`--quality takes a whole number from 1 to 100, not "${text}".`);
    } else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}.`);
    else if (args.source === undefined) args.source = arg;
    else throw new Error(`Name one source folder, not "${args.source}" and "${arg}".`);
  }
  if (!args.help && args.source === undefined) throw new Error("Name the folder of pictures.");
  return args;
}

interface Env {
  cwd: string;
  log: (line: string) => void;
  error: (line: string) => void;
}

// The command: returns the exit code.
async function main(argv: string[], { cwd, log, error }: Env): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (problem) {
    error(`${(problem as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    log(USAGE);
    return 0;
  }
  const source = resolve(cwd, args.source!);
  if (!(await stat(source).then((s) => s.isDirectory(), () => false))) {
    error(`${args.source} is not a folder.\n\n${USAGE}`);
    return 2;
  }
  const out = resolve(cwd, args.out);
  const { written, kept, failed, skipped } = await makeImages({ source, out, widths: args.widths, formats: args.formats, base: args.base, quality: args.quality, log });
  for (const line of skipped) log(`Left out ${line}`);
  for (const line of failed) error(`Could not write ${line}`);
  log(`\n${written} written, ${kept} up to date, ${skipped.length} left out, ${failed.length} failed. Manifest: ${relative(cwd, join(out, "images.json"))}`);
  return failed.length ? 1 : 0;
}

/* node:coverage disable */
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2), { cwd: process.cwd(), log: console.log, error: console.error });
}
/* node:coverage enable */
