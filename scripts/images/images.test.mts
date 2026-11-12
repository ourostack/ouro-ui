import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { FORMATS, HERO_FLOOR, main, makeImages, parseArgs, planWidths, shortfall, WIDTHS, type Format, type Manifest } from "../../registry/ouro/images/images.ts";

// Ouro images (registry/ouro/images/images.ts) on pictures made here with sharp. scripts/images.test.mjs runs this file
// under Node's coverage and holds images.ts to 100%.

const here = dirname(fileURLToPath(import.meta.url));
const scratch = join(here, "../..", ".tmp", `images-${process.pid}`);
mkdirSync(scratch, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));

let made = 0;
const dir = (name: string) => {
  const path = join(scratch, `${name}-${++made}`);
  mkdirSync(path, { recursive: true });
  return path;
};
const picture = async (file: string, width: number, height: number) => {
  mkdirSync(dirname(file), { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: "#3a7" } }).png().toFile(file);
};
const sizeOf = async (file: string) => {
  const { width, height, format } = await sharp(file).metadata();
  return `${format} ${width}×${height}`;
};
const run = async (argv: string[], cwd = scratch) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { cwd, log: (line) => out.push(line), error: (line) => err.push(line) });
  return { code, out: out.join("\n"), err: err.join("\n") };
};

describe("Ouro images", () => {
  test("plans each width narrower than the picture, then its own", () => {
    assert.deepEqual(planWidths(1000, WIDTHS), [320, 640, 960, 1000]);
    assert.deepEqual(planWidths(640, WIDTHS), [320, 640]);
    assert.deepEqual(planWidths(200, WIDTHS), [200]);
    assert.deepEqual(planWidths(3000, [1280, 320]), [320, 1280, 3000]);
  });

  test("writes each picture as AVIF and WebP at each width, and a manifest with the srcset of each", async () => {
    const source = dir("source");
    await picture(join(source, "hero.png"), 1000, 500);
    await picture(join(source, "people/ana.jpg"), 400, 400);
    writeFileSync(join(source, "logo.svg"), "<svg/>");
    await picture(join(source, ".cache/skip.png"), 100, 100);
    await picture(join(source, "node_modules/skip.png"), 100, 100);
    const out = join(source, "out");
    await picture(join(out, "old.png"), 100, 100);
    const logged: string[] = [];
    const result = await makeImages({ source, out, base: "/images/", log: (line) => logged.push(line) });
    assert.equal(result.written, 2 * 4 + 2 * 2);
    assert.deepEqual([result.failed, result.skipped], [[], []]);
    const manifest = JSON.parse(readFileSync(join(out, "images.json"), "utf8")) as Manifest;
    assert.deepEqual(manifest, result.manifest);
    assert.deepEqual(Object.keys(manifest), ["hero.png", "people/ana.jpg"]);
    assert.match(manifest["hero.png"]!.made, /^[0-9a-f]{64}$/);
    assert.deepEqual(manifest["hero.png"], {
      made: manifest["hero.png"]!.made,
      width: 1000,
      height: 500,
      src: "/images/hero-1000.webp",
      sources: [
        { type: "image/avif", srcset: "/images/hero-320.avif 320w, /images/hero-640.avif 640w, /images/hero-960.avif 960w, /images/hero-1000.avif 1000w" },
        { type: "image/webp", srcset: "/images/hero-320.webp 320w, /images/hero-640.webp 640w, /images/hero-960.webp 960w, /images/hero-1000.webp 1000w" },
      ],
    });
    assert.equal(await sizeOf(join(out, "hero-640.avif")), "heif 640×320");
    assert.equal(await sizeOf(join(out, "hero-1000.webp")), "webp 1000×500");
    assert.equal(await sizeOf(join(out, "people/ana-320.webp")), "webp 320×320");
    assert.deepEqual(logged, ["hero.png: 1000×500 at 320, 640, 960, 1000 wide, as avif and webp", "people/ana.jpg: 400×400 at 320, 400 wide, as avif and webp"]);
  });

  test("turns a photo upright as its EXIF orientation says, and percent-encodes an address with a space or a #", async () => {
    const source = dir("upright");
    // Stored 400×200, shown 200×400: a phone held upright.
    await sharp({ create: { width: 400, height: 200, channels: 3, background: "#3a7" } }).jpeg().withMetadata({ orientation: 6 }).toFile(join(source, "my photo.jpg"));
    const out = dir("upright-out");
    const result = await makeImages({ source, out, widths: [100], formats: ["webp"], base: "/i/", log: () => undefined });
    assert.deepEqual(result.manifest["my photo.jpg"], { made: result.manifest["my photo.jpg"]!.made, width: 200, height: 400, src: "/i/my%20photo-200.webp", sources: [{ type: "image/webp", srcset: "/i/my%20photo-100.webp 100w, /i/my%20photo-200.webp 200w" }] });
    assert.equal(await sizeOf(join(out, "my photo-100.webp")), "webp 100×200");
    await picture(join(source, "team#1.png"), 150, 150);
    const again = await makeImages({ source, out, widths: [100], formats: ["webp"], base: "/i/", log: () => undefined });
    assert.equal(again.manifest["team#1.png"]!.sources[0]!.srcset, "/i/team%231-100.webp 100w, /i/team%231-150.webp 150w");
  });

  test("reads a source folder inside the out folder, and leaves out an animated picture", async () => {
    const out = dir("outer");
    const source = join(out, "originals");
    await picture(join(source, "a.png"), 100, 100);
    const red = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#f00" } }).png().toBuffer();
    const blue = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#00f" } }).png().toBuffer();
    await sharp([red, blue], { join: { animated: true } }).webp().toFile(join(source, "moving.webp"));
    const result = await makeImages({ source, out, formats: ["webp"], log: () => undefined });
    assert.deepEqual(Object.keys(result.manifest), ["a.png"]);
    assert.deepEqual(result.skipped, ["moving.webp: animated, and its frames would be lost; serve it as it is"]);
  });

  test("refuses two pictures that would write the same files, and a picture whose header reads but whose pixels do not", async () => {
    const source = dir("clash");
    await picture(join(source, "photo.jpg"), 100, 100);
    await picture(join(source, "photo.png"), 100, 100);
    await picture(join(source, "cut.png"), 300, 300);
    truncateSync(join(source, "cut.png"), Math.floor(statSync(join(source, "cut.png")).size * 0.7));
    const result = await makeImages({ source, out: dir("clash-out"), formats: ["webp"], log: () => undefined });
    assert.deepEqual(Object.keys(result.manifest), ["photo.jpg"]);
    assert.equal(result.failed.length, 2);
    assert.match(result.failed[0]!, /^cut\.png: /);
    assert.equal(result.failed[1], "photo.png: it would write the same files as photo.jpg; rename one of them");
  });

  test("keeps a picture's files while its bytes and options are the same, and writes them again when either changes", async () => {
    const source = dir("again");
    const out = dir("again-out");
    await picture(join(source, "a.png"), 700, 100);
    const options = { source, out, widths: [320], formats: ["webp"] as Format[], log: () => undefined };
    const counts = async (extra = {}) => {
      const { written, kept } = await makeImages({ ...options, ...extra });
      return [written, kept];
    };
    assert.deepEqual(await counts(), [2, 0]);
    // A newer time on the same bytes changes nothing.
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(source, "a.png"), later, later);
    assert.deepEqual(await counts(), [0, 2]);
    assert.deepEqual(await counts({ quality: 10 }), [2, 0]);
    assert.deepEqual(await counts({ quality: 10 }), [0, 2]);
    // Another picture of the same size, moved in with an older time, as an unzipped download keeps it.
    await sharp({ create: { width: 700, height: 100, channels: 3, background: "#a37" } }).png().toFile(join(source, "a.png"));
    const earlier = new Date(Date.now() - 86_400_000);
    utimesSync(join(source, "a.png"), earlier, earlier);
    assert.deepEqual(await counts({ quality: 10 }), [2, 0]);
    rmSync(join(out, "a-320.webp"));
    assert.deepEqual(await counts({ quality: 10 }), [2, 0]);
    assert.match(JSON.parse(readFileSync(join(out, "images.json"), "utf8"))["a.png"].made, /^[0-9a-f]{64}$/);
  });

  test("names a file it cannot read, and writes the rest", async () => {
    const source = dir("broken");
    writeFileSync(join(source, "broken.png"), "not a picture");
    await picture(join(source, "fine.png"), 100, 100);
    const result = await makeImages({ source, out: dir("broken-out"), formats: ["avif"], log: () => undefined });
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0]!, /^broken\.png: /);
    assert.deepEqual(Object.keys(result.manifest), ["fine.png"]);
    assert.equal(result.manifest["fine.png"]!.src, "fine-100.avif");
  });
});

describe("Ouro images' refusal of pictures too small to draw sharp", () => {
  test("refuses a picture narrower than twice its widest drawn width, or under the long-edge floor, and passes one at the line", () => {
    assert.equal(shortfall("a.png", 2400, 900, { maxWidth: 1200 }), undefined);
    assert.equal(
      shortfall("a.png", 2399, 900, { maxWidth: 1200 }),
      "2399×900 is narrower than 2400, twice the 1200 CSS pixels it is drawn at, so a 2x screen would draw it blurry; give it a source at least 2400 wide",
    );
    assert.equal(HERO_FLOOR, 2048);
    assert.equal(shortfall("scenes/sea.png", 2048, 768), undefined);
    assert.equal(shortfall("Hero/sea.png", 1536, 2048), undefined);
    assert.equal(shortfall("site/scenes/sea.png", 2047, 768), "2047×768 has a long edge under 2048, the floor for hero and scene art; give it a source at least 2048 on its long edge");
    assert.equal(shortfall("scenes.png", 1536, 512), undefined);
    assert.equal(shortfall("heroes/a.png", 2048, 900, { minLongEdge: 4096 }), "2048×900 has a long edge under 4096; give it a source at least 4096 on its long edge");
    assert.equal(shortfall("icons/a.png", 300, 300, { minLongEdge: 512 }), "300×300 has a long edge under 512; give it a source at least 512 on its long edge");
  });

  test("writes nothing for a refused picture, and the rest as before", async () => {
    const source = dir("refuse");
    await picture(join(source, "scene/sea.png"), 1536, 512);
    await picture(join(source, "wide.png"), 2400, 400);
    await picture(join(source, "narrow.png"), 1000, 400);
    const out = join(source, "out");
    const result = await makeImages({ source, out, widths: [], formats: ["webp"], maxWidth: 1200, log: () => {} });
    assert.deepEqual(result.failed, [
      "narrow.png: 1000×400 is narrower than 2400, twice the 1200 CSS pixels it is drawn at, so a 2x screen would draw it blurry; give it a source at least 2400 wide",
      "scene/sea.png: 1536×512 is narrower than 2400, twice the 1200 CSS pixels it is drawn at, so a 2x screen would draw it blurry; give it a source at least 2400 wide",
    ]);
    assert.deepEqual(Object.keys(result.manifest), ["wide.png"]);
    assert.equal(result.written, 1);
    assert.throws(() => statSync(join(out, "narrow-1000.webp")));
    const floor = await makeImages({ source, out, widths: [], formats: ["webp"], log: () => {} });
    assert.deepEqual(floor.failed, ["scene/sea.png: 1536×512 has a long edge under 2048, the floor for hero and scene art; give it a source at least 2048 on its long edge"]);
    assert.throws(() => statSync(join(out, "scene/sea-1536.webp")));
  });
});

describe("Ouro images' command", () => {
  test("reads every option, and refuses what it cannot run", () => {
    assert.deepEqual(parseArgs(["pics", "--out", "o", "--widths", "320,640", "--formats", "webp, avif", "--base", "/i/", "--quality", "80"]), {
      source: "pics",
      out: "o",
      widths: [320, 640],
      formats: ["webp", "avif"],
      base: "/i/",
      quality: 80,
      help: false,
    });
    assert.deepEqual(parseArgs(["pics", "--max-width", "1200", "--min-long-edge", "2048"]), {
      source: "pics",
      out: "public/images",
      widths: WIDTHS,
      formats: FORMATS,
      base: "",
      quality: 70,
      maxWidth: 1200,
      minLongEdge: 2048,
      help: false,
    });
    assert.deepEqual(parseArgs(["pics"]), { source: "pics", out: "public/images", widths: WIDTHS, formats: FORMATS, base: "", quality: 70, help: false });
    assert.equal(parseArgs(["-h"]).help, true);
    for (const [argv, message] of [
      [["a", "--out"], /--out needs a value/],
      [["a", "--base", "--out"], /--base needs a value/],
      [["a", "--widths", "320,wide"], /not "320,wide"/],
      [["a", "--widths", "0"], /not "0"/],
      [["a", "--formats", "gif"], /--formats takes avif, webp or both, not "gif"/],
      [["a", "--quality", "0"], /from 1 to 100, not "0"/],
      [["a", "--quality", "101"], /not "101"/],
      [["a", "--quality", "7.5"], /not "7\.5"/],
      [["a", "--max-width", "wide"], /--max-width takes a whole number of pixels, such as 1200, not "wide"/],
      [["a", "--min-long-edge", "0"], /--min-long-edge takes a whole number of pixels, such as 1200, not "0"/],
      [["a", "--wat"], /Unknown option --wat/],
      [["a", "b"], /Name one source folder, not "a" and "b"/],
      [[], /Name the folder of pictures/],
    ] as [string[], RegExp][]) {
      assert.throws(() => parseArgs(argv), message, argv.join(" "));
    }
  });

  test("prints its usage, refuses a usage problem or a missing folder with 2, and exits 1 when a picture is unreadable", async () => {
    const help = await run(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.out, /^Usage: node lib\/ouro\/images\/images\.ts/);
    const wrong = await run(["--wat"]);
    assert.equal(wrong.code, 2);
    assert.match(wrong.err, /^Unknown option --wat\.\n\nUsage:/);
    const missing = await run(["nowhere"]);
    assert.equal(missing.code, 2);
    assert.match(missing.err, /^nowhere is not a folder\./);
    const cwd = dir("cwd");
    await picture(join(cwd, "pictures/a.png"), 400, 200);
    const fine = await run(["pictures", "--widths", "320"], cwd);
    assert.equal(fine.code, 0, fine.err);
    assert.match(fine.out, /\n4 written, 0 up to date, 0 left out, 0 failed\. Manifest: public\/images\/images\.json$/);
    writeFileSync(join(cwd, "pictures/b.png"), "not a picture");
    const broken = await run(["pictures", "--widths", "320"], cwd);
    assert.equal(broken.code, 1);
    assert.match(broken.err, /^Not written: b\.png: /);
    assert.match(broken.out, /0 written, 4 up to date, 0 left out, 1 failed\./);
    const red = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#f00" } }).png().toBuffer();
    const blue = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#00f" } }).png().toBuffer();
    await sharp([red, blue], { join: { animated: true } }).webp().toFile(join(cwd, "pictures/moving.webp"));
    const animated = await run(["pictures", "--widths", "320"], cwd);
    assert.match(animated.out, /^Left out moving\.webp: animated/m);
    const refused = await run(["pictures", "--widths", "320", "--max-width", "300"], cwd);
    assert.equal(refused.code, 1);
    assert.match(refused.err, /^Not written: a\.png: 400×200 is narrower than 600, twice the 300 CSS pixels it is drawn at/m);
  });
});
