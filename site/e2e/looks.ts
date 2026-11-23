import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { majorityFirst, waived } from "./waivers.ts";
import { siteReady } from "./ready.ts";

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
      // A redirect page (an old address) navigates away as it loads, so what is pictured there belongs to no page.
      else if (name === "index.html" && !readFileSync(full, "utf8").includes('http-equiv="refresh"')) found.push(path);
    }
  };
  walk(DIST, "/");
  return found.filter((route) => !/^\/(storybook|r)\//.test(route)).sort();
}

// The components index's previews (components/catalog-preview.tsx) are pictures, scaled down and inert: no look of a page.
export const LOOK_SELECTOR = ":is([data-ouro], [data-ouro-part], [data-ouro-control]):not([data-site-preview] *)";

export interface Look {
  index: number;
  key: string;
  sig: string;
  pictured: boolean;
  size: string;
  behind: string;
  /** Its own attributes as it was described, so a picture taken after it changed is not judged by this look. */
  attributes: string;
}

export interface Described {
  looks: Look[];
  escapes: string[];
}

// Runs in the page, so it refers to nothing outside itself.
export function describe(arg: { selector: string; only?: number }): Described {
  // An avatar showing its picture (data-image=loaded) is another state from one showing initials, as the crew's faces on /nautilus/ are.
  const stateAttr = /^data-(checked|unchecked|disabled|invalid|variant|tone|size|orientation|open|pressed|selected|shape|highlighted|layout|image)$/;
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
  // A hover lift of up to 2px is layout settling, not a look: a translate-only transform that small reads as none.
  const lift = (t: string) => {
    const m = /^matrix\((.*)\)$/.exec(t);
    if (!m) return t;
    const v = m[1]!.split(",").map(Number);
    const still = Math.abs(v[0]! - 1) < 0.001 && Math.abs(v[3]! - 1) < 0.001 && Math.abs(v[1]!) < 0.001 && Math.abs(v[2]!) < 0.001;
    if (still && Math.abs(v[4]!) <= 2 && Math.abs(v[5]!) <= 2) return "none";
    return `matrix(${v.slice(0, 4).map((n) => Math.round(n * 100) / 100).join(",")},${Math.round(v[4]! / 2) * 2},${Math.round(v[5]! / 2) * 2})`;
  };
  const behindOf = (el: HTMLElement) => {
    // The site header floats over scrolling content (Ctrl+K differed on / alone). A sidebar control's crop in WebKit dark differed from page to page on whichever page ran, with every property equal; the properties judge it.
    if (el.closest("[data-ouro=sidebar], header, [data-ouro=code-block], [data-site-preset]") || el.textContent === "Copy" || /(, 0?\.\d+\)|\/ 0?\.\d+\))$/.test(getComputedStyle(el).backgroundColor)) return "translucent";
    for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const c = s.backgroundColor;
      // A crop over a see-through backdrop shows what is behind it, so only the properties judge it.
      if (s.backdropFilter !== "none" || s.backgroundImage !== "none" || /(, 0?\.\d+\)|\/ 0?\.\d+\))$/.test(c)) return "translucent";
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
      const rect = el.getBoundingClientRect();
      const short = Math.min(rect.width, rect.height);
      const raw = cs.borderTopLeftRadius;
      const radius = raw.endsWith("%") ? (parseFloat(raw) / 100) * short : parseFloat(raw);
      if (!(radius > 0)) continue;
      if (short < 4 || short > 120 || radius < short / 2 - 0.5) continue;
      // A token radius larger than half the box (a checkbox's rounded-ouro-sm, a skeleton line's rounded-ouro-md) is a squircle by design,
      // not a pill: only an exact half or an unclamped rounded-full counts as a round part.
      if (radius > short / 2 + 0.5 && radius < 1000) continue;
      // A token radius that happens to equal half the box (a 28px plate's rounded-ouro-md) is still a squircle by design.
      if (/(^|\s)rounded-(?:ouro-)?(sm|md|lg|xl|2xl|3xl)(\s|$)/.test(String(el.getAttribute("class") ?? "")) && !/rounded-full/.test(String(el.getAttribute("class") ?? ""))) continue;
      const long = Math.max(rect.width, rect.height);
      const circle = long - short <= 1;
      const thin = short <= 12;
      const interactiveRoot = el.hasAttribute("data-ouro") && el.hasAttribute("data-ouro-control");
      if ((!circle && !thin) || interactiveRoot || el.tagName === "BUTTON") continue;
      const painted = (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0;
      const shape = cs.getPropertyValue("corner-shape");
      if (!painted || !shape || shape === "superellipse(1)" || shape === "round") continue;
      const owner = el.closest<HTMLElement>("[data-ouro]")?.dataset["ouro"] ?? "page";
      escapes.push(`${owner}|${el.dataset["ouroPart"] ?? el.tagName.toLowerCase()}|${Math.round(rect.width)}x${Math.round(rect.height)}: round part (radius ${Math.round(radius)}px) is drawn ${shape}`);
    }
  }
  // Each element described is marked with its index, and picture() finds it by the mark: the page can add elements
  // between the two (an island that loads as the scroll nears it), which moved a position-based lookup onto another
  // element (#1463). A mark is written only when it changes, and a mark another element still holds for the same index
  // goes, so one index names one element.
  // With `only`, the element described is the one holding that mark, wherever the page has moved it in the document since;
  // nothing is re-marked, because a position-based mark lands on whatever now sits at that position (the sweep's hover
  // read of a control an island had pushed down the page described and pictured another control).
  const held = arg.only === undefined ? null : document.querySelector(`[data-sweep-look="${arg.only}"]`);
  if (arg.only === undefined) {
    const marked = new Set<Element>();
    all.forEach((el, index) => {
      if (el.getAttribute("data-sweep-look") !== String(index)) el.setAttribute("data-sweep-look", String(index));
      marked.add(el);
    });
    for (const other of document.querySelectorAll("[data-sweep-look]")) if (!marked.has(other)) other.removeAttribute("data-sweep-look");
  }
  all.forEach((el, position) => {
    if (arg.only !== undefined && el !== held) return;
    const index = arg.only ?? position;
    const root = el.closest<HTMLElement>("[data-ouro]");
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const attrs = [...el.attributes]
      .filter((a) => stateAttr.test(a.name) || ariaState.test(a.name) || (a.name === "disabled" && el.tagName !== "A"))
      .map((a) => `${a.name}=${a.value}`)
      .sort()
      .join(",");
    const inGroup = el.closest("[data-ouro='button-group'], [data-ouro='scroll-area'], [data-ouro='avatar-group']") !== null;
    const name = root?.dataset["ouro"];
    const theme = el.closest<HTMLElement>("[data-theme]")?.dataset["theme"] ?? "";
    const sizeOf = `${px(String(rect.width))}x${px(String(rect.height))}`;
    const labelled = (el.textContent ?? "").trim().length > 0;
    const shapeOf = (labelled ? `h${px(String(rect.height))}` : sizeOf) + (el.querySelector("svg") ? "+icon" : "") + (el.closest("main") ? "" : "+chrome");
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
          // An outline of style none draws nothing, but its width still computes (3px at rest, a focus rule's 1px once the element
          // has focus, #2230), so only a drawn outline's width and colour are part of the look.
          cs.outlineStyle === "none" ? "outline none" : `outline ${cs.outlineStyle} ${cs.outlineWidth} ${named ? "" : rgb(cs.outlineColor)}`,
          `padding ${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
          `gap ${cs.rowGap} ${cs.columnGap}`,
          named ? "" : `background ${rgb(cs.backgroundColor)} ${cs.backgroundImage === "none" ? "" : "image"}`,
          named ? "" : `color ${rgb(cs.color)}`,
          control && text ? `font ${cs.fontSize} ${cs.fontWeight} ${cs.letterSpacing}` : "",
          `shadow ${cs.boxShadow}`,
          `opacity ${cs.opacity}`,
          cs.textDecorationLine === "none" ? "" : `decoration ${cs.textDecorationLine} ${cs.textDecorationStyle} ${cs.textDecorationThickness} ${cs.textUnderlineOffset} ${named ? "" : rgb(cs.textDecorationColor)}`,
          `transform ${lift(cs.transform)} ${cs.filter}`,
          control && !text ? `children ${children.join(" ")}` : "",
          control ? `icons ${icons.join(" ")}` : "",
        ].join(" ; ");
    const visible = rect.width >= 6 && rect.height >= 6 && rect.width <= 400 && rect.height <= 300 && cs.visibility !== "hidden";
    const isCrop = visible && el.getAttribute("data-ouro") !== "heading" && (el.hasAttribute("data-ouro") || el.hasAttribute("data-ouro-control"));
    // Content the site puts inside a control (a colour dot) is part of its picture, so only controls holding the same content compare.
    const content = [...el.querySelectorAll<HTMLElement>("*")]
      .map((n) => getComputedStyle(n).backgroundColor)
      .filter((c) => c !== "rgba(0, 0, 0, 0)");
    const own = behindOf(el);
    const behind = own === "translucent" || content.length === 0 ? own : `${own}+${content.join(",")}`;
    const size = `${sizeOf}${(el.textContent ?? "").trim().slice(0, 40) ? `|${(el.textContent ?? "").trim().slice(0, 40)}` : ""}`;
    const pictureKey = `${key}|${size}|${behind}`;
    const pictured = isCrop && behind !== "translucent" && !seenPictured.has(pictureKey);
    if (pictured) seenPictured.add(pictureKey);
    const attributes = [...el.attributes].filter((a) => !a.name.startsWith("data-sweep-")).map((a) => `${a.name}=${a.value}`).sort().join(" ");
    looks.push({ index, key, sig, pictured, size, behind, attributes });

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
// transparent (icons, which are not text, stay), and motion is stopped. So is an underline: it snaps to the pixel grid
// apart from its box, so the same link a fraction of a pixel lower drew it a row lower. The properties judge it instead.
export async function quiet(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "*,*::before,*::after{-webkit-text-fill-color:transparent!important;text-decoration-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;transition:none!important;animation:none!important}",
  });
  // A transition already running (a switch a page toggles on its own) ends on the next frame, not at once.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

// One route gets a minute. A browser call that never returns (WebKit's mouse.up, a screenshot of a page that
// navigated) would otherwise hold the whole shard to its 15-minute limit; the route is logged as skipped,
// its page is closed so the hung call ends, and the sweep goes on with a fresh page.
// Advances a frame and reports whether a transition or a finite (non-looping) animation was running on the page, in
// which case it is waited out: `document.getAnimations()` covers CSS transitions, CSS keyframe animations and
// element.animate(), so a mover that is none of these (a spinner's own looping animation stays; it never finishes)
// still settles before a picture is taken (states-sweep.ts, both a state's first take and a retake's second).
export async function motionTick(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const running = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    if (running.length === 0) return false;
    await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => null))), new Promise((done) => setTimeout(done, 500))]);
    return true;
  });
}

// The home page's stage is below the fold at load and judges the screen only once scrolled into view, a beat and
// then up to a couple of seconds of real frames later, committing its verdict (the fish swimming or still) with a
// plain state update: no CSS Animation or Transition marks that commit, so motionTick and document.getAnimations()
// never see it coming. A control scrolled near the stage (its own speed, depth, tanks, dive, lights, log or bell
// control) brings it onscreen and can leave its judge mid-flight; left unwaited, the verdict can then land while a
// later control is mid-retake, so that control's two takes differ even though it never changed
// (ourostack/ouro-ui#2989). Call this after every control's own scroll, not once before the sweep's loop: the stage
// only ever starts judging once it is actually onscreen, which a one-time call before any scroll cannot observe.
// A page with no stage, a stage still offscreen, or one that has already judged, returns at once.
export async function stagePaced(page: Page): Promise<void> {
  const stage = page.locator("[data-stage]");
  if ((await stage.count()) === 0) return;
  const onscreen = await stage.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const viewHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewWidth = window.innerWidth || document.documentElement.clientWidth;
    return rect.bottom > 0 && rect.top < viewHeight && rect.right > 0 && rect.left < viewWidth;
  });
  if (!onscreen) return;
  await expect
    .poll(async () => (await stage.getAttribute("data-paced")) !== null, { timeout: SETTLE_MS })
    .toBe(true)
    .catch(() => {
      // Reduced motion, or a judge that never got three real frames inside its deadline, never sets data-paced:
      // nothing more to wait for.
    });
}

// One route gets a minute. A browser call that never returns (WebKit's mouse.up, a screenshot of a page that
// navigated) would otherwise hold the whole shard to its 15-minute limit; the route is logged as skipped,
// its page is closed so the hung call ends, and the sweep goes on with a fresh page.
export function routeGuard(context: BrowserContext, first: Page, ms = 60_000) {
  let current = first;
  const skipped: string[] = [];
  const visit = async (path: string, body: (page: Page) => Promise<void>) => {
    const page = current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"late">((done) => {
      timer = setTimeout(() => done("late"), ms);
    });
    try {
      if ((await Promise.race([body(page).then(() => "done" as const), late])) === "late") {
        skipped.push(path);
        console.log(`SKIPPED ${path}: took over ${ms / 1000}s`);
        await page.close().catch(() => {});
        current = await context.newPage();
        current.setDefaultTimeout(5_000);
      }
    } finally {
      clearTimeout(timer);
    }
  };
  return { visit, skipped };
}

export async function picture(page: Page, index: number, attributes?: string): Promise<Crop | null> {
  const target = page.locator(`[data-sweep-look="${index}"]`);
  // The page can change between describing and picturing; an element that is gone has no picture.
  const handle = await target.elementHandle({ timeout: 2_000 }).catch(() => null);
  if (!handle) return null;
  // The site scrolls smoothly (html's scroll-behavior), so a plain scrollIntoView is still moving when the cover check reads
  // the element, and the picture was skipped (#1463).
  await handle.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })).catch(() => {});
  const clear = await handle.evaluate((el) => {
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
  }).catch(() => false);
  if (!clear) return null;
  const png = await handle.screenshot({ animations: "disabled", caret: "hide", timeout: 15_000 }).catch(() => null);
  if (!png) return null;
  // Scrolling it into view can wake the part of the page it is in (an island hydrates and an avatar's picture loads), so a
  // picture of an element whose attributes changed since it was described shows another state than its look's.
  if (attributes !== undefined) {
    const now = await handle.evaluate((el) => [...el.attributes].filter((a) => !a.name.startsWith("data-sweep-")).map((a) => `${a.name}=${a.value}`).sort().join(" ")).catch(() => null);
    if (now !== attributes) return null;
  }
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const scale = await page.evaluate(() => devicePixelRatio).catch(() => 1);
  return { data, width: info.width, height: info.height, scale };
}

/** An element's picture: its pixels, and how many of them make a CSS pixel. */
interface Crop {
  data: Buffer;
  width: number;
  height: number;
  scale: number;
}

interface Sample {
  where: string;
  sig: string;
  /** Which instance on the page: its label, so a log can tell two on one page apart. */
  label?: string;
  crop?: Crop & { id: string };
}

export interface SavedLooks {
  groups: [string, { where: string; sig: string; label?: string }[]][];
  pictures: [string, { where: string; width: number; height: number; scale: number; png: string }[]][];
}

export class Looks {
  private readonly groups = new Map<string, Sample[]>();
  private readonly pictures = new Map<string, Sample[]>();

  add(where: string, look: Look, crop?: Crop | null, label?: string): void {
    const list = this.groups.get(look.key) ?? [];
    this.groups.set(look.key, list);
    list.push({ where, sig: look.sig, ...(label ? { label } : {}) });
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

  /**
   * What a sweep part found, as JSON: every sample of every key, and each picture as a PNG, so one job can compare the
   * parts' looks with each other (scripts/sweeps-compare.mjs). A picture's PNG decodes to the same pixels.
   */
  async save(): Promise<SavedLooks> {
    const pictures: SavedLooks["pictures"] = [];
    for (const [id, samples] of this.pictures) {
      const saved: SavedLooks["pictures"][number][1] = [];
      for (const s of samples) {
        const { data, width, height, scale } = s.crop!;
        const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
        saved.push({ where: s.where, width, height, scale, png: png.toString("base64") });
      }
      pictures.push([id, saved]);
    }
    return { groups: [...this.groups], pictures };
  }

  /** Adds what another part found after what this one holds, so a tie goes to the earlier part's look. */
  async merge(saved: SavedLooks): Promise<void> {
    for (const [key, samples] of saved.groups) this.groups.set(key, [...(this.groups.get(key) ?? []), ...samples]);
    for (const [id, pics] of saved.pictures) {
      const list = this.pictures.get(id) ?? [];
      this.pictures.set(id, list);
      for (const p of pics) {
        const { data } = await sharp(Buffer.from(p.png, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        list.push({ where: p.where, sig: "", crop: { id, data, width: p.width, height: p.height, scale: p.scale } });
      }
    }
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

  // Both sides of each difference that is not waived, in the order the samples were taken, so a log names the look each
  // side had: with two samples, the first one taken stands for the majority, and the line above can blame the right one.
  sides(): string[] {
    const out: string[] = [];
    const shown = this.rawDifferences().filter((line) => !waived(line));
    for (const [key, samples] of this.groups) {
      const bySig = new Map<string, number[]>();
      samples.forEach((s, n) => {
        const at = bySig.get(s.sig);
        if (at) at.push(n);
        else bySig.set(s.sig, [n]);
      });
      if (bySig.size < 2) continue;
      const sigs = [...bySig.keys()];
      const parts = sigs.map((sig) => sig.split(" ; "));
      const described = sigs.map((sig, n) => {
        const own = parts[n]!.filter((p) => parts.some((other, m) => m !== n && !other.includes(p)));
        const taken = bySig.get(sig)!.map((i) => `#${i + 1} ${samples[i]!.where}${samples[i]!.label ? ` "${samples[i]!.label}"` : ""}`).join(", ");
        return `${taken}: ${own.join(" ; ")}`;
      });
      if (shown.some((line) => line.startsWith(`${key} on `))) out.push(`${key} (${samples.length} samples) | ${described.join(" | ")}`);
    }
    return out;
  }

  rawDifferences(): string[] {
    const out: string[] = [];
    for (const [key, samples] of this.groups) {
      const bySig = new Map<string, string[]>();
      for (const s of samples) {
        const at = bySig.get(s.sig);
        if (at) at.push(s.where);
        else bySig.set(s.sig, [s.where]);
      }
      if (bySig.size < 2) continue;
      // The most samples stand for the look, but a page a waiver is for never does (#2249).
      const [majority, ...rest] = majorityFirst(key, bySig);
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

function same(a: Crop, b: Crop): boolean {
  // A CSS pixel is `scale` pixels of the picture (2 in the WebKit project, Desktop Safari), so the slack is in CSS pixels.
  const reach = Math.max(1, Math.round(Math.max(a.scale, b.scale)));
  if (Math.abs(a.width - b.width) > 2 * reach || Math.abs(a.height - b.height) > 2 * reach) return false;
  // Fractional sizes round to a pixel apart; compare the part both have.
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  // A layout that lands a pixel over (fractional positions) is not a break, so the best of the shifts up to one CSS pixel counts.
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
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

/**
 * How long a page is given to read the same twice. One read of a long page in WebKit can take seconds, so Playwright's
 * 5 s left /docs/calendar/ two reads, then cut off a third that matched (ourostack/ouro-ui#2428).
 */
export const SETTLE_MS = 30_000;

/**
 * Waits for the page to finish loading: the load event, the fonts, and a count of the elements the sweeps look at that
 * stays the same across several frames, so an island that mounts late has done so before any control is read.
 */
export async function loaded(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.evaluate(async ([selector]) => {
    await document.fonts.ready;
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const deadline = Date.now() + 10_000;
    let last = -1;
    let same = 0;
    while (same < 6 && Date.now() < deadline) {
      await frame();
      const count = document.querySelectorAll(selector as string).length;
      same = count === last ? same + 1 : 0;
      last = count;
    }
  }, [LOOK_SELECTOR] as const);
}

export async function settled(page: Page): Promise<void> {
  await siteReady(page);
  let last = "";
  let before: Look[] = [];
  let after: Look[] = [];
  const reads: number[] = [];
  const began = Date.now();
  try {
    await expect
      .poll(
        async () => {
          const start = Date.now();
          const looks = (await page.evaluate(describe, { selector: LOOK_SELECTOR })).looks;
          reads.push(Date.now() - start);
          before = after;
          after = looks;
          const now = JSON.stringify(after.map((l) => l.sig));
          const same = now === last;
          last = now;
          return same;
        },
        { timeout: SETTLE_MS },
      )
      .toBe(true);
  } catch (error) {
    // Which looks kept changing, so a page that never settles names what moved, and how many reads it had time for (ourostack/ouro-ui#2428).
    const timing = `  ${reads.length} reads in ${Date.now() - began} ms, the slowest ${Math.max(0, ...reads)} ms`;
    (error as Error).message += `\n\nThe page never settled (ourostack/ouro-ui#2428): ${page.url()}\n${changedLooks(before, after)}\n${timing}`;
    throw error;
  }
}

/**
 * The looks that differ between two reads of a page, up to three, each with the parts of its signature that changed, and
 * how many looks the page gained or lost. Many elements share a key (every plain button of a kind), so the looks of a key
 * are paired in page order: one that changed among its twins is still named (ourostack/ouro-ui#2428).
 */
export function changedLooks(before: readonly Look[], after: readonly Look[]): string {
  const byKey = (looks: readonly Look[]) => {
    const groups = new Map<string, string[]>();
    for (const look of looks) groups.set(look.key, [...(groups.get(look.key) ?? []), look.sig]);
    return groups;
  };
  const was = byKey(before);
  const now = byKey(after);
  const changed: { key: string; old: string; sig: string }[] = [];
  let added = 0;
  let gone = 0;
  for (const [key, sigs] of now) {
    const old = was.get(key) ?? [];
    for (let i = 0; i < Math.min(sigs.length, old.length); i++) if (sigs[i] !== old[i]) changed.push({ key, old: old[i]!, sig: sigs[i]! });
    added += Math.max(0, sigs.length - old.length);
  }
  for (const [key, sigs] of was) gone += Math.max(0, sigs.length - (now.get(key)?.length ?? 0));
  const lines = changed.slice(0, 3).map(({ key, old, sig }) => {
    const then = old.split(" ; ");
    const is = sig.split(" ; ");
    return `  ${key}: ${is.filter((part) => !then.includes(part)).join(" ; ")} (was ${then.filter((part) => !is.includes(part)).join(" ; ")})`;
  });
  if (changed.length > 3) lines.push(`  and ${changed.length - 3} more`);
  if (gone || added) lines.push(`  ${added} looks appeared and ${gone} went between the last two reads`);
  if (lines.length > 0) return lines.join("\n");
  const moved = after.findIndex((look, index) => look.key !== before[index]?.key);
  return moved === -1 ? "  the last two reads were the same" : `  the last two reads differed only in the order of the looks: at ${moved}, ${after[moved]!.key} (was ${before[moved]?.key ?? "nothing"})`;
}
