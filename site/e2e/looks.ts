import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { waived } from "./waivers.ts";

// The shared half of the site's cross-page checks (sameness-sweep.ts, states-sweep.ts): the routes of the
// build, a description of how an Ouro element looks (its box, padding, gap, colours, font, shadow, opacity,
// transform, corners, border, outline and the geometry of its children), a picture of it with its text
// hidden, and the comparison that flags an instance that differs from the ones that share its component,
// variant, state, theme and surface.

const DIST = join(import.meta.dirname, "..", "dist");

export function routes(): string[] {
  const found: string[] = [];
  const walk = (dir: string, path: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${path}${name}/`);
      else if (name === "index.html") found.push(path);
    }
  };
  walk(DIST, "/");
  return found.filter((route) => !/^\/(storybook|r)\//.test(route)).sort();
}

export const LOOK_SELECTOR = "[data-ouro], [data-ouro-part], [data-ouro-control]";

export interface Look {
  index: number;
  key: string;
  sig: string;
  pictured: boolean;
  size: string;
  behind: string;
}

export interface Described {
  looks: Look[];
  escapes: string[];
}

// Runs in the page, so it refers to nothing outside itself.
export function describe(arg: { selector: string; only?: number }): Described {
  const stateAttr = /^data-(checked|unchecked|disabled|invalid|variant|tone|size|orientation|open|pressed|selected|shape)$/;
  const ariaState = /^aria-(checked|pressed|selected|expanded|disabled|invalid|current)$/;
  const all = [...document.querySelectorAll<HTMLElement>(arg.selector)];
  const looks: Look[] = [];
  const escapes: string[] = [];
  const seenPictured = new Set<string>();
  const px = (v: string) => Math.round(parseFloat(v) || 0);
  const ctx = document.createElement("canvas").getContext("2d");
  const rgb = (v: string) => {
    if (!ctx || !v || v === "transparent") return v;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `${d[0]},${d[1]},${d[2]},${d[3]}`;
  };
  // Components whose full-radius shape is the squircle on purpose; dots, lights, thumbs and pills are not.
  const SQUIRCLE_BY_DESIGN = new Set(["avatar", "avatar-group", "checkbox", "checklist", "skeleton", "media-tile"]);
  // A hover lift under 2px is sub-pixel layout, not a look: translate offsets are compared in 2px steps.
  const lift = (t: string) => {
    const m = /^matrix\((.*)\)$/.exec(t);
    if (!m) return t;
    const v = m[1]!.split(",").map(Number);
    if (v.join() === "1,0,0,1,0,0") return "none";
    return `matrix(${v.slice(0, 4).join(",")},${Math.round(v[4]! / 2) * 2},${Math.round(v[5]! / 2) * 2})`;
  };
  const behindOf = (el: HTMLElement) => {
    for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const c = s.backgroundColor;
      // A crop over a see-through backdrop shows what is behind it, so only the properties judge it.
      if (s.backdropFilter !== "none" || /(, 0?\.\d+\)|\/ 0?\.\d+\))$/.test(c)) return "translucent";
      if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
    }
    return "page";
  };
  // A dot, light, thumb or pill is a circle by its geometry, so whatever its name or classes, it is drawn round.
  // Every visible element counts, not only the ones X-ray names.
  if (arg.only === undefined) {
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const radius = parseFloat(cs.borderTopLeftRadius);
      if (!(radius > 0)) continue;
      const rect = el.getBoundingClientRect();
      const short = Math.min(rect.width, rect.height);
      if (short < 4 || short > 120 || radius < short / 2 - 0.5) continue;
      const long = Math.max(rect.width, rect.height);
      const circle = long - short <= 1;
      const thin = short <= 12;
      const interactiveRoot = el.hasAttribute("data-ouro") && el.hasAttribute("data-ouro-control");
      if ((!circle && !thin) || interactiveRoot || el.tagName === "BUTTON") continue;
      const painted = (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0;
      const shape = cs.getPropertyValue("corner-shape");
      if (!painted || !shape || shape === "superellipse(1)" || shape === "round") continue;
      const owner = el.closest<HTMLElement>("[data-ouro]")?.dataset["ouro"] ?? "page";
      if (SQUIRCLE_BY_DESIGN.has(owner)) continue;
      escapes.push(`${owner}|${el.dataset["ouroPart"] ?? el.tagName.toLowerCase()}|${Math.round(rect.width)}x${Math.round(rect.height)}: round part (radius ${Math.round(radius)}px) is drawn ${shape}`);
    }
  }
  all.forEach((el, index) => {
    if (arg.only !== undefined && arg.only !== index) return;
    const root = el.closest<HTMLElement>("[data-ouro]");
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const attrs = [...el.attributes]
      .filter((a) => stateAttr.test(a.name) || ariaState.test(a.name) || (a.name === "disabled" && el.tagName !== "A"))
      .map((a) => `${a.name}=${a.value}`)
      .sort()
      .join(",");
    const inGroup = el.closest("[data-ouro='button-group'], [data-ouro='scroll-area']") !== null;
    const name = root?.dataset["ouro"];
    const theme = el.closest<HTMLElement>("[data-theme]")?.dataset["theme"] ?? "";
    const sizeOf = `${px(String(rect.width))}x${px(String(rect.height))}`;
    const labelled = (el.textContent ?? "").trim().length > 0;
    const shapeOf = labelled ? `h${px(String(rect.height))}` : sizeOf;
    // Size comes from props that leave no attribute, and a preset repaints its subtree, so both belong to the key.
    const key = `${inGroup ? "grouped " : ""}${name}|${el.dataset["ouroPart"] ?? ""}|${el.tagName.toLowerCase()}|${attrs}|${shapeOf}|${theme}|${labelled ? rgb(cs.color) : ""}`;
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius];
    const rounded = radii.some((r) => parseFloat(r) > 0);
    const corner = cs.getPropertyValue("corner-shape");
    for (const pseudo of ["::before", "::after"] as const) {
      const layer = getComputedStyle(el, pseudo);
      if (layer.content === "none" || !rounded || layer.borderTopLeftRadius !== cs.borderTopLeftRadius) continue;
      if (parseFloat(layer.borderTopLeftRadius) > 0 && layer.getPropertyValue("corner-shape") !== corner) {
        escapes.push(`${key}: ${pseudo} layer is ${layer.getPropertyValue("corner-shape")} inside ${corner}`);
      }
    }
    // A visible layer of a component must lie inside the component's box, whatever its peers look like.
    if (el.hasAttribute("data-ouro")) {
      for (const pseudo of ["::before", "::after"] as const) {
        const layer = getComputedStyle(el, pseudo);
        if (layer.content === "none" || layer.position !== "absolute" || layer.display === "none") continue;
        const filled = rgb(layer.backgroundColor).split(",")[3] !== "0" && layer.backgroundColor !== "rgba(0, 0, 0, 0)";
        if (!filled && layer.boxShadow === "none" && layer.backgroundImage === "none") continue;
        const w = parseFloat(layer.width);
        const h = parseFloat(layer.height);
        // Local, unscaled coordinates: a press scale shrinks the root's rect but not the layer's computed size.
        const left = el.clientLeft + (parseFloat(layer.left) || 0);
        const top = el.clientTop + (parseFloat(layer.top) || 0);
        const boxW = el.offsetWidth;
        const boxH = el.offsetHeight;
        if (!(w > 0 && h > 0)) continue;
        if (left < -1 || top < -1 || left + w > boxW + 1 || top + h > boxH + 1) {
          escapes.push(`${key}: ${pseudo} layer sits ${Math.round(left)},${Math.round(top)} ${Math.round(w)}x${Math.round(h)} outside its ${boxW}x${boxH} box`);
        }
      }
    }
    const text = (el.textContent ?? "").trim().length > 0;
    const byDesign = name === "item" || inGroup;
    const control = el.hasAttribute("data-ouro-control");
    const named = !control || name === "avatar" || name === "avatar-group";
    const children = [...el.children].flatMap((child) => {
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return [];
      const childText = (child.textContent ?? "").trim().length > 0;
      const size = childText ? `${px(String(r.height))}` : `${px(String(r.width))}x${px(String(r.height))}`;
      const at = text ? "" : `@${px(String(r.left - rect.left))},${px(String(r.top - rect.top))}`;
      return [`${child.tagName.toLowerCase()}:${size}${at}`];
    });
    const icons = [...el.querySelectorAll("svg")].map((s) => {
      const r = s.getBoundingClientRect();
      return `${px(String(r.width))}x${px(String(r.height))}`;
    });
    const sig = byDesign
      ? "item"
      : [
          `corner ${rounded ? corner : "square"}`,
          `radius ${radii.map((r) => px(r)).join(" ")}`,
          `border ${cs.borderTopWidth} ${cs.borderTopStyle} ${named ? "" : rgb(cs.borderTopColor)}`,
          `outline ${cs.outlineStyle} ${cs.outlineWidth} ${named ? "" : rgb(cs.outlineColor)}`,
          `padding ${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
          `gap ${cs.rowGap} ${cs.columnGap}`,
          named ? "" : `background ${rgb(cs.backgroundColor)} ${cs.backgroundImage === "none" ? "" : "image"}`,
          named ? "" : `color ${rgb(cs.color)}`,
          control && text ? `font ${cs.fontSize} ${cs.fontWeight} ${cs.letterSpacing}` : "",
          `shadow ${cs.boxShadow}`,
          `opacity ${cs.opacity}`,
          `transform ${lift(cs.transform)} ${cs.filter}`,
          control && !text ? `children ${children.join(" ")}` : "",
          control ? `icons ${icons.join(" ")}` : "",
        ].join(" ; ");
    const visible = rect.width >= 6 && rect.height >= 6 && rect.width <= 400 && rect.height <= 300 && cs.visibility !== "hidden";
    const isCrop = visible && (el.hasAttribute("data-ouro") || el.hasAttribute("data-ouro-control"));
    const behind = behindOf(el);
    const size = sizeOf;
    const pictureKey = `${key}|${sizeOf}|${behind}`;
    const pictured = isCrop && behind !== "translucent" && !seenPictured.has(pictureKey);
    if (pictured) seenPictured.add(pictureKey);
    looks.push({ index, key, sig, pictured, size, behind });

    if ((el.getAttribute("role") === "switch" && el.dataset["ouroPart"] === "track") || el.dataset["ouroPart"] === "circle") {
      for (const child of el.children) {
        const inner = child.getBoundingClientRect();
        if (inner.width === 0) continue;
        if (inner.left < rect.left - 1 || inner.right > rect.right + 1 || inner.top < rect.top - 1 || inner.bottom > rect.bottom + 1) {
          escapes.push(`${key}: ${child.tagName.toLowerCase()} leaves its container`);
        }
      }
    }
  });
  return { looks, escapes };
}

// Text drawn in a picture would differ between instances of the same component for no reason, so it is made
// transparent (icons, which are not text, stay), and motion is stopped.
export async function quiet(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "*,*::before,*::after{-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;transition:none!important;animation:none!important}",
  });
}

export async function picture(page: Page, index: number): Promise<{ data: Buffer; width: number; height: number } | null> {
  const target = page.locator(LOOK_SELECTOR).nth(index);
  await target.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  const clear = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const points: [number, number][] = [
      [r.left + 2, r.top + 2],
      [r.right - 2, r.top + 2],
      [r.left + 2, r.bottom - 2],
      [r.right - 2, r.bottom - 2],
      [r.left + r.width / 2, r.top + r.height / 2],
    ];
    return points.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (el.contains(hit) || hit.contains(el));
    });
  });
  if (!clear) return null;
  const png = await target.screenshot({ animations: "disabled", caret: "hide" });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

interface Sample {
  where: string;
  sig: string;
  crop?: { id: string; data: Buffer; width: number; height: number };
}

export class Looks {
  private readonly groups = new Map<string, Sample[]>();
  private readonly pictures = new Map<string, Sample[]>();

  add(where: string, look: Look, crop?: { data: Buffer; width: number; height: number } | null): void {
    const list = this.groups.get(look.key) ?? [];
    this.groups.set(look.key, list);
    list.push({ where, sig: look.sig });
    if (crop) {
      const id = `${look.key}|${look.size}|${look.behind}`;
      const pics = this.pictures.get(id) ?? [];
      this.pictures.set(id, pics);
      pics.push({ where, sig: "", crop: { id, ...crop } });
    }
  }

  // Pictures are slow, so a key gets three of them from instances whose properties agree, and up to five more
  // from instances whose properties already differ from the first one seen.
  wants(look: Look): boolean {
    const taken = this.pictures.get(`${look.key}|${look.size}|${look.behind}`)?.length ?? 0;
    const first = this.groups.get(look.key)?.[0];
    return taken < 3 || (taken < 5 && first !== undefined && first.sig !== look.sig);
  }

  get keys(): number {
    return this.groups.size;
  }

  get crops(): number {
    return [...this.pictures.values()].reduce((n, l) => n + l.length, 0);
  }

  // Instances whose properties differ from the majority's, less the differences a page makes on purpose.
  differences(): string[] {
    return this.rawDifferences().filter((line) => !waived(line));
  }

  rawDifferences(): string[] {
    const out: string[] = [];
    for (const [key, samples] of this.groups) {
      const bySig = new Map<string, string[]>();
      for (const s of samples) bySig.set(s.sig, [...(bySig.get(s.sig) ?? []), s.where]);
      if (bySig.size < 2) continue;
      const [majority, ...rest] = [...bySig].sort((a, b) => b[1].length - a[1].length);
      for (const [sig, where] of rest) {
        const left = majority![0].split(" ; ");
        const diff = sig.split(" ; ").filter((p) => !left.includes(p));
        out.push(`${key} on ${[...new Set(where)].slice(0, 3).join(", ")}: ${diff.join(" ; ")}`);
      }
    }
    return out;
  }

  // Pictures that differ from the biggest cluster of look-alikes.
  pixelDifferences(): string[] {
    const out: string[] = [];
    for (const [id, samples] of this.pictures) {
      if (samples.length < 3) continue;
      const clusters: Sample[][] = [];
      for (const s of samples) {
        const home = clusters.find((c) => same(c[0]!.crop!, s.crop!));
        if (home) home.push(s);
        else clusters.push([s]);
      }
      if (clusters.length < 2) continue;
      clusters.sort((a, b) => b.length - a.length);
      for (const c of clusters.slice(1)) out.push(`${id} looks different on ${[...new Set(c.map((s) => s.where))].slice(0, 3).join(", ")}`);
    }
    return out.filter((line) => !waived(line));
  }
}

function same(a: { data: Buffer; width: number; height: number }, b: { data: Buffer; width: number; height: number }): boolean {
  if (Math.abs(a.width - b.width) > 2 || Math.abs(a.height - b.height) > 2) return false;
  // Fractional sizes round to a pixel apart; compare the part both have.
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  // A layout that lands a pixel over (fractional positions) is not a break, so the best of nine one-pixel shifts counts.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      let off = 0;
      let seen = 0;
      for (let y = Math.max(0, dy); y < Math.min(h, h + dy); y++) {
        for (let x = Math.max(0, dx); x < Math.min(w, w + dx); x++) {
          const i = (y * a.width + x) * 4;
          const k = ((y - dy) * b.width + (x - dx)) * 4;
          seen++;
          if (Math.max(Math.abs(a.data[i]! - b.data[k]!), Math.abs(a.data[i + 1]! - b.data[k + 1]!), Math.abs(a.data[i + 2]! - b.data[k + 2]!)) > 40) off++;
        }
      }
      if (off / seen <= 0.015) return true;
    }
  }
  return false;
}

export async function settled(page: Page): Promise<void> {
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  let last = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify((await page.evaluate(describe, { selector: LOOK_SELECTOR })).looks.map((l) => l.sig));
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}
