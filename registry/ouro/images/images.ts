export { FORMATS, HERO_FLOOR, main, makeImages, planWidths, shortfall, WIDTHS };
export type { Format, ImageEntry, ImagesOptions, ImagesResult, Manifest };

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { quietPipes, runCli, type CliIo } from "../ax/cli.ts";
import { defineCli, defineCommand, toArgv, type Cli, type Input } from "../ax/command.ts";
import { outcome, type Outcome } from "../ax/outcome.ts";
import { AxError, commandLine } from "../ax/problem.ts";

// Ouro images: each raster picture in a folder as AVIF and WebP at each width up to its own, and images.json with the
// srcset of each, so a page draws a picture sharp at every screen size without sending a phone the widest file.
//
//   node lib/ouro/images/images.ts <source folder> [--out <folder>] [--widths 320,640,…] [--formats avif,webp]
//        [--base <url prefix>] [--quality <1-100>] [--max-width <css px>] [--min-long-edge <px>]
//
// It refuses a picture too small to be drawn sharp, and writes nothing for it: one narrower than twice --max-width, the
// widest it is drawn (a 2x screen needs two pixels for each), and one whose long edge is under --min-long-edge, or under
// 2048 when it sits in a folder named hero, heroes, scene or scenes, as a page's big art does. The browser cannot add
// detail a file lacks, so the fix is a larger source.
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
  /** The widest, in CSS pixels, these pictures are drawn; a picture narrower than twice it is refused. */
  maxWidth?: number | undefined;
  /** A long edge a picture must reach; a picture whose long edge is shorter is refused. */
  minLongEdge?: number | undefined;
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
/** The long edge a page's big art must reach: a picture in a hero, heroes, scene or scenes folder. */
const HERO_FLOOR = 2048;
const HERO = /^(hero|heroes|scene|scenes)$/i;

// Why a picture `width`×`height` at `name` is too small to be drawn sharp, or undefined when it is not: narrower than
// twice the widest it is drawn, or a long edge under the floor, which is HERO_FLOOR for big art when none is set higher.
function shortfall(name: string, width: number, height: number, { maxWidth, minLongEdge = 0 }: Pick<ImagesOptions, "maxWidth" | "minLongEdge"> = {}) {
  const hero = name.split("/").slice(0, -1).some((part) => HERO.test(part));
  const floor = Math.max(minLongEdge, hero ? HERO_FLOOR : 0);
  if (maxWidth !== undefined && width < maxWidth * 2)
    return `${width}×${height} is narrower than ${maxWidth * 2}, twice the ${maxWidth} CSS pixels it is drawn at, so a 2x screen would draw it blurry; give it a source at least ${maxWidth * 2} wide`;
  if (Math.max(width, height) < floor)
    return `${width}×${height} has a long edge under ${floor}${hero && floor === HERO_FLOOR ? ", the floor for hero and scene art" : ""}; give it a source at least ${floor} on its long edge`;
  return undefined;
}

// The widths to write for a picture `width` pixels wide: each of `widths` narrower than it, then its own.
const planWidths = (width: number, widths: number[]) => [...new Set([...widths.filter((w) => w < width), width])].sort((a, b) => a - b);

// Writes each picture under `source` into `out` at each width and format, turned upright as its EXIF orientation says,
// and `out`/images.json. Hidden folders, node_modules and an `out` inside `source` are left out, and so is an animated
// picture, which would lose its frames.
async function makeImages({ source, out, widths = WIDTHS, formats = FORMATS, base = "", quality = 70, maxWidth, minLongEdge, log = console.log }: ImagesOptions): Promise<ImagesResult> {
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
      const small = shortfall(name, width, height, { maxWidth, minLongEdge });
      if (small) {
        result.failed.push(`${name}: ${small}`);
        continue;
      }
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

interface ImagesReport {
  /** The manifest's path, relative to the folder the command ran in. */
  manifest: string;
  written: number;
  kept: number;
  skipped: string[];
  /** One line per picture written or kept, as the text output names them. */
  pictures: string[];
}

const usageError = (cli: Cli, code: string, problem: string, fix: string) => new AxError({ code, exit: cli.exits.code("usage"), thing: "images", problem, fix });

// The command as typed, with some of its input replaced: the fix an error prints.
const fixFor = (cli: Cli, input: Input, changes: Input) => commandLine([cli.name, ...toArgv(cli, cli.commands[0]!, { ...input, ...changes }).argv]);

// The kit checks a number flag's range; a whole number is the one thing it does not check.
function wholeFlag(cli: Cli, input: Input, name: string): number | undefined {
  const value = input[name] as number | undefined;
  if (value === undefined || Number.isInteger(value)) return value;
  throw usageError(cli, "bad-value", `--${name} takes a whole number, not "${value}"`, fixFor(cli, input, { [name]: Math.round(value) }));
}

// The command's run: the pictures are written in the folder it ran in, and a picture that cannot be written fails it.
async function runImages(cli: Cli, cwd: string, input: Input): Promise<ImagesReport | Outcome> {
  const widthsGiven = input["widths"] as readonly string[] | undefined;
  const widths = widthsGiven?.map(Number) ?? WIDTHS;
  if (widths.length === 0 || widths.some((w) => !Number.isInteger(w) || w < 1))
    throw usageError(cli, "bad-value", `--widths takes whole numbers of pixels, such as 320,640, not "${widthsGiven}"`, fixFor(cli, input, { widths: ["320", "640"] }));
  const formatsGiven = input["formats"] as readonly string[] | undefined;
  const formats = formatsGiven ?? FORMATS;
  if (formats.length === 0 || formats.some((f) => !(FORMATS as readonly string[]).includes(f)))
    throw usageError(cli, "bad-value", `--formats takes avif, webp or both, not "${formatsGiven}"`, fixFor(cli, input, { formats: ["avif", "webp"] }));
  const quality = wholeFlag(cli, input, "quality") ?? 70;
  const maxWidth = wholeFlag(cli, input, "max-width");
  const minLongEdge = wholeFlag(cli, input, "min-long-edge");
  const folder = String(input["folder"]);
  const source = resolve(cwd, folder);
  if (!(await stat(source).then((s) => s.isDirectory(), () => false)))
    throw usageError(cli, "not-a-folder", `"${folder}" is not a folder`, fixFor(cli, input, { folder: "<folder>" }));
  const out = resolve(cwd, (input["out"] as string | undefined) ?? "public/images");
  const pictures: string[] = [];
  const result = await makeImages({
    source,
    out,
    widths,
    formats: formats as Format[],
    base: (input["base"] as string | undefined) ?? "",
    quality,
    maxWidth,
    minLongEdge,
    log: (line) => {
      pictures.push(line);
    },
  });
  const manifest = relative(cwd, join(out, "images.json"));
  if (result.failed.length > 0)
    return outcome({
      action: "images",
      state: "failed",
      summary: `${result.written} written, ${result.kept} up to date, ${result.skipped.length} left out, ${result.failed.length} not written. Manifest: ${manifest}`,
      error: { code: "not-written", exit: cli.exits.code("error"), thing: "images", problem: `not written: ${result.failed.join("; ")}`, fix: null },
    });
  return { manifest, written: result.written, kept: result.kept, skipped: result.skipped, pictures };
}

// The text output: each picture's line, each one left out, then the counts and the manifest.
function reportText({ manifest, written, kept, skipped, pictures }: ImagesReport): string {
  return [...pictures, ...skipped.map((line) => `Left out ${line}`), `\n${written} written, ${kept} up to date, ${skipped.length} left out, 0 failed. Manifest: ${manifest}`].join("\n");
}

// One command with no command word: every token is the folder or a flag, as `ouro-images site/showcase --out x` runs it.
function imagesTool(cwd: string): Cli {
  const cli: Cli = defineCli({
    name: "ouro-images",
    about: ["ouro-images: writes the pictures in a folder at the widths a page's srcset needs, for a <picture> element."],
    command: defineCommand<ImagesReport | Outcome>({
      name: "images",
      summary: "Writes each raster picture in a folder as AVIF and WebP at each width up to its own, and images.json with the srcset of each.",
      effect: "private",
      examples: ["ouro-images site/showcase --out site/public/showcase --widths 640,960,1280 --base /showcase/"],
      args: [{ name: "folder", description: "The folder of pictures.", required: true }],
      flags: {
        out: { type: "string", placeholder: "<folder>", description: "Where the pictures and images.json go (default public/images)." },
        widths: { type: "list", placeholder: "<320,640>", description: "The widths written below each picture's own (default 320,640,960,1280,1920,2560,3840,5120)." },
        formats: { type: "list", placeholder: "<avif,webp>", description: "The formats, the fallback last (default avif,webp)." },
        base: { type: "string", placeholder: "<prefix>", description: "What each address in a srcset starts with, such as /images/ (default none)." },
        quality: { type: "number", min: 1, max: 100, description: "The encoder's quality, from 1 to 100 (default 70)." },
        "max-width": {
          type: "number",
          min: 1,
          placeholder: "<px>",
          description: "The widest, in CSS pixels, the pictures are drawn; a picture narrower than twice it is refused, and gets no files.",
        },
        "min-long-edge": {
          type: "number",
          min: 1,
          placeholder: "<px>",
          description: "The fewest pixels a picture's long edge may have (default 2048 in a folder named hero, heroes, scene or scenes, else none); a smaller one is refused.",
        },
      },
      output: "{ manifest, written, kept, skipped, pictures }",
      run: (input) => runImages(cli, cwd, input),
      text: (report) => reportText(report as ImagesReport),
    }),
  });
  return cli;
}

// The command: returns the exit code. The kit parses the arguments, prints the result or the one error line, and exits.
async function main(argv: readonly string[], { cwd, ...io }: CliIo & { cwd: string }): Promise<number> {
  return runCli(imagesTool(cwd), argv, io);
}

/* node:coverage disable */
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  quietPipes(process);
  process.exitCode = await main(process.argv.slice(2), { cwd: process.cwd(), stdout: process.stdout, stderr: process.stderr });
}
/* node:coverage enable */
