import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { HERO_FLOOR, main, makeImages, planWidths, shortfall, WIDTHS, type Format, type Manifest } from "../../registry/ouro/images/images.ts";

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
  let out = "";
  let err = "";
  const code = await main(argv, { cwd, stdout: { write: (s) => ((out += s), true) }, stderr: { write: (s) => ((err += s), true) } });
  return { code, out, err };
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
  test("reads every option, and writes what it names", async () => {
    const cwd = dir("options");
    await picture(join(cwd, "pics/a.png"), 1000, 500);
    const result = await run(["pics", "--out", "o", "--widths", "320,640", "--formats", "webp,avif", "--base", "/i/", "--quality", "80"], cwd);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /\n6 written, 0 up to date, 0 left out, 0 failed\. Manifest: o\/images\.json\n$/);
    assert.equal(await sizeOf(join(cwd, "o/a-320.webp")), "webp 320×160");
    assert.equal(await sizeOf(join(cwd, "o/a-1000.avif")), "heif 1000×500");
    const manifest = JSON.parse(readFileSync(join(cwd, "o/images.json"), "utf8")) as Manifest;
    assert.deepEqual(manifest["a.png"]!.sources, [
      { type: "image/webp", srcset: "/i/a-320.webp 320w, /i/a-640.webp 640w, /i/a-1000.webp 1000w" },
      { type: "image/avif", srcset: "/i/a-320.avif 320w, /i/a-640.avif 640w, /i/a-1000.avif 1000w" },
    ]);
    assert.equal(manifest["a.png"]!.src, "/i/a-1000.avif");
  });

  test("writes to public/images, every width up to the picture's own, in AVIF and WebP, when no option is given", async () => {
    const cwd = dir("defaults");
    await picture(join(cwd, "pictures/a.png"), 700, 100);
    const result = await run(["pictures"], cwd);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /^a\.png: 700×100 at 320, 640, 700 wide, as avif and webp\n\n6 written, 0 up to date, 0 left out, 0 failed\. Manifest: public\/images\/images\.json\n$/);
    assert.equal(await sizeOf(join(cwd, "public/images/a-640.avif")), "heif 640×91");
  });

  test("refuses what it cannot run with one line that names the fix, and exits 2", async () => {
    const cwd = dir("refusals");
    await picture(join(cwd, "pictures/a.png"), 400, 200);
    const refusals: [string[], RegExp][] = [
      [["pictures", "--widths", "320,wide"], /^ouro-images: images: --widths takes whole numbers of pixels, such as 320,640, not "320,wide"\. Fix: ouro-images pictures --widths 320,640\.\n$/],
      [["pictures", "--widths", "0"], /not "0"\. Fix: ouro-images pictures --widths 320,640\.\n$/],
      [["pictures", "--widths", ","], /not ""\. Fix: ouro-images pictures --widths 320,640\.\n$/],
      [["pictures", "--formats", "gif"], /^ouro-images: images: --formats takes avif, webp or both, not "gif"\. Fix: ouro-images pictures --formats avif,webp\.\n$/],
      [["pictures", "--formats", ","], /not ""\. Fix: ouro-images pictures --formats avif,webp\.\n$/],
      [["pictures", "--quality", "7.5"], /^ouro-images: images: --quality takes a whole number, not "7\.5"\. Fix: ouro-images pictures --quality 8\.\n$/],
      [["pictures", "--quality", "0"], /^ouro-images: images: --quality takes a number from 1 to 100, not "0"\. Fix: ouro-images pictures --quality 1\.\n$/],
      [["pictures", "--max-width", "1200.5"], /not "1200\.5"\. Fix: ouro-images pictures --max-width 1201\.\n$/],
      [["pictures", "--min-long-edge", "10.5"], /not "10\.5"\. Fix: ouro-images pictures --min-long-edge 11\.\n$/],
      [["nowhere"], /^ouro-images: images: "nowhere" is not a folder\. Fix: ouro-images <folder>\.\n$/],
      [["pictures/a.png"], /^ouro-images: images: "pictures\/a\.png" is not a folder\. Fix: ouro-images <folder>\.\n$/],
      [[], /^ouro-images: images: needs <folder>\. Fix: ouro-images <folder>\.\n$/],
      [["pictures", "pictures"], /"pictures" is one word too many: it takes <folder>; quote text with spaces\. Fix: ouro-images pictures\.\n$/],
      [["pictures", "--wat"], /^ouro-images: .*there is no --wat/],
    ];
    for (const [argv, message] of refusals) {
      const result = await run(argv, cwd);
      assert.equal(result.code, 2, argv.join(" "));
      assert.equal(result.out, "", argv.join(" "));
      assert.match(result.err, message, argv.join(" "));
    }
  });

  test("prints its help from the kit, which names no command word, and exits 0", async () => {
    const help = await run(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.out, /^ouro-images: Writes each raster picture in a folder as AVIF and WebP/);
    assert.match(help.out, /ouro-images <folder> \[--out <folder>\]/);
    assert.doesNotMatch(help.out, /ouro-images images/);
    assert.equal(help.err, "");
  });

  test("exits 1 when a picture cannot be written, with one error line, and --json says why", async () => {
    const cwd = dir("broken");
    await picture(join(cwd, "pictures/a.png"), 400, 200);
    writeFileSync(join(cwd, "pictures/b.png"), "not a picture");
    const failed = await run(["pictures", "--widths", "320"], cwd);
    assert.equal(failed.code, 1);
    assert.equal(failed.out, "");
    assert.match(failed.err, /^ouro-images: images: not written: b\.png: .+\.\n$/);
    assert.equal(failed.err.split("\n").length, 2);
    const json = JSON.parse((await run(["pictures", "--widths", "320", "--json"], cwd)).out) as { ax: string; state: string; error: { code: string } };
    assert.deepEqual([json.ax, json.state, json.error.code], ["outcome/1", "failed", "not-written"]);
  });

  test("names each picture it leaves out, and a picture narrower than --max-width is refused", async () => {
    const cwd = dir("left-out");
    await picture(join(cwd, "pictures/a.png"), 400, 200);
    const red = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#f00" } }).png().toBuffer();
    const blue = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#00f" } }).png().toBuffer();
    await sharp([red, blue], { join: { animated: true } }).webp().toFile(join(cwd, "pictures/moving.webp"));
    const animated = await run(["pictures", "--widths", "320"], cwd);
    assert.equal(animated.code, 0, animated.err);
    assert.match(animated.out, /^a\.png: 400×200 at 320, 400 wide, as avif and webp\nLeft out moving\.webp: animated, and its frames would be lost; serve it as it is\n\n4 written, 0 up to date, 1 left out, 0 failed\. Manifest: public\/images\/images\.json\n$/);
    const refused = await run(["pictures", "--widths", "320", "--max-width", "300"], cwd);
    assert.equal(refused.code, 1);
    assert.match(refused.err, /^ouro-images: images: not written: a\.png: 400×200 is narrower than 600, twice the 300 CSS pixels it is drawn at, so a 2x screen would draw it blurry; give it a source at least 600 wide\.\n$/);
  });

  test("--json prints the run's report: its manifest, the counts and each picture's line", async () => {
    const cwd = dir("json");
    await picture(join(cwd, "pictures/a.png"), 400, 200);
    const report = JSON.parse((await run(["pictures", "--widths", "320", "--json"], cwd)).out) as { manifest: string; written: number; kept: number; skipped: string[]; pictures: string[] };
    assert.deepEqual(report, { manifest: "public/images/images.json", written: 4, kept: 0, skipped: [], pictures: ["a.png: 400×200 at 320, 400 wide, as avif and webp"] });
  });
});
