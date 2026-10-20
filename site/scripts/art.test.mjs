import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { ART_BUDGET, artDir, CHAPTER_ART_BUDGET, checkArt, readArt, sha256 } from "./art.mts";

const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`);

function original(file, bytes, extra = {}) {
  return {
    file,
    title: "A sardine",
    creator: "Ouro HX contributors",
    source: "original-svg",
    published: "2026-10-18",
    licence: "repository",
    sha256: sha256(bytes),
    modifications: "None: drawn for this site.",
    ...extra,
  };
}

function fixture() {
  const fish = svg('<path d="M0 0h1"/>');
  return { manifest: { art: [original("sardine.svg", fish)] }, files: new Map([["sardine.svg", fish]]) };
}

test("the committed drawings match their manifest", () => {
  assert.deepEqual(checkArt(readArt(artDir)), []);
});

test("a clean manifest passes", () => {
  assert.deepEqual(checkArt(fixture()), []);
});

test("a drawing the manifest does not list fails", () => {
  const art = fixture();
  art.files.set("squid.svg", svg(""));
  assert.match(checkArt(art).join("\n"), /squid\.svg is not in manifest\.json/);
});

test("an entry whose file is missing fails", () => {
  const art = fixture();
  art.files.delete("sardine.svg");
  assert.match(checkArt(art).join("\n"), /sardine\.svg is listed but missing/);
});

test("a drawing changed without updating its checksum fails", () => {
  const art = fixture();
  art.files.set("sardine.svg", svg('<path d="M0 0h2"/>'));
  assert.match(checkArt(art).join("\n"), /sardine\.svg: sha256 is .* but the file's is/);
});

test("a licence outside the allow-list fails", () => {
  const art = fixture();
  art.manifest.art[0].licence = "CC-BY-SA-4.0";
  assert.match(checkArt(art).join("\n"), /sardine\.svg: licence "CC-BY-SA-4.0" is not one of repository, public-domain/);
});

test("an original drawing must carry the repository's licence", () => {
  const art = fixture();
  art.manifest.art[0].licence = "public-domain";
  assert.match(checkArt(art).join("\n"), /sardine\.svg: an original drawing is licensed with the repository/);
});

test("every field is required", () => {
  const art = fixture();
  delete art.manifest.art[0].modifications;
  art.manifest.art[0].title = "";
  const errors = checkArt(art).join("\n");
  assert.match(errors, /sardine\.svg: modifications is required/);
  assert.match(errors, /sardine\.svg: title is required/);
});

function publicDomain(extra = {}) {
  const plate = svg("<rect/>");
  const entry = {
    file: "plate.svg",
    title: "The Nautilus at the surface",
    creator: "Alphonse de Neuville",
    source: "https://commons.wikimedia.org/wiki/File:Plate.jpg",
    published: "1871",
    licence: "public-domain",
    sha256: sha256(plate),
    modifications: "Traced to vector and recoloured from the theme.",
    ...extra,
  };
  return { manifest: { art: [entry] }, files: new Map([["plate.svg", plate]]) };
}

test("a public-domain plate by Verne's illustrators, published by 1871, from Commons or Gallica passes", () => {
  assert.deepEqual(checkArt(publicDomain()), []);
  assert.deepEqual(checkArt(publicDomain({ creator: "Édouard Riou", source: "https://gallica.bnf.fr/ark:/12148/x", published: "1870" })), []);
});

test("public-domain art by anyone else fails", () => {
  assert.match(checkArt(publicDomain({ creator: "Harper Goff" })).join("\n"), /plate\.svg: public-domain art must be by Alphonse de Neuville or Édouard Riou/);
});

test("public-domain art published after 1871 fails", () => {
  assert.match(checkArt(publicDomain({ published: "1954" })).join("\n"), /plate\.svg: public-domain art must be published by 1871, not 1954/);
});

test("public-domain art from any other host fails", () => {
  const errors = checkArt(publicDomain({ source: "https://example.com/nautilus.jpg" })).join("\n");
  assert.match(errors, /plate\.svg: public-domain art must come from commons\.wikimedia\.org or gallica\.bnf\.fr/);
  assert.match(checkArt(publicDomain({ source: "not a url" })).join("\n"), /must come from/);
});

test("a drawing of the Nautilus quotes Verne for its shape, with the chapter", () => {
  const ship = svg("<path/>");
  const entry = original("nautilus.svg", ship, { title: "The Nautilus, in profile" });
  const art = { manifest: { art: [entry] }, files: new Map([["nautilus.svg", ship]]) };
  assert.match(checkArt(art).join("\n"), /nautilus\.svg: a drawing of the Nautilus needs shape notes quoting Verne/);
  entry.shape = [{ quote: "It is an elongated cylinder with conical ends.", chapter: "" }];
  assert.match(checkArt(art).join("\n"), /nautilus\.svg: each shape note needs a quote and its chapter/);
  entry.shape = [{ quote: "It is an elongated cylinder with conical ends.", chapter: "Part One, Chapter XII" }];
  assert.deepEqual(checkArt(art), []);
});

test("the drawings stay inside the hero's budget", () => {
  const art = fixture();
  const big = Buffer.from(randomBytes(60_000).toString("hex"));
  art.files.set("sardine.svg", big);
  art.manifest.art[0].sha256 = sha256(big);
  assert.match(checkArt(art).join("\n"), new RegExp(`over the hero's ${ART_BUDGET} byte gzip budget`));
});

test("a chapter's drawings count against the chapter's budget, not the hero's", () => {
  const art = fixture();
  const plan = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!--${randomBytes(CHAPTER_ART_BUDGET).toString("base64")}--></svg>`);
  art.files.set("plan.svg", plan);
  art.manifest.art.push(original("plan.svg", plan, { chapter: "I" }));
  assert.match(checkArt(art).join("\n"), /Chapter I's drawings are \d+ bytes gzipped, over its/);
  assert.doesNotMatch(checkArt(art).join("\n"), /over the hero's/);
  const small = svg('<path d="M0 0h2"/>');
  art.files.set("plan.svg", small);
  art.manifest.art.at(-1).sha256 = sha256(small);
  assert.deepEqual(checkArt(art), []);
  assert.ok(CHAPTER_ART_BUDGET > ART_BUDGET);
});
