import { mkdirSync, writeFileSync } from "node:fs";

// A waiver is one difference one page makes on purpose. It names one component, part, variant, state, page and
// property, and says why and where the page's own source asks for it. A waiver that matches nothing fails the
// stale check (scripts/waivers.mjs), so this list only shrinks.
export type Waiver = {
  component: string;
  part: string;
  variant: string;
  /** The state it covers: "" for the page at rest, "hover", "active" or "focus", or "*" for every state. */
  state: string;
  page: string;
  property: string;
  reason: string;
  source: string;
};

export const WAIVERS: Waiver[] = [
  {
    component: "switch",
    part: "track",
    variant: "",
    // The duel's colour is the page's in every state, so a hover or a press reads it too (#2249).
    state: "*",
    page: "/apple/feel/",
    property: "border",
    reason: "the hero's duel sits on the glow, so its quiet text, which the off switch's outline reads, takes a step toward the foreground",
    source: "site/src/apple/feel-reins.css: .feel-duel sets --muted-foreground to --apple-quiet-on-glow (apple.css)",
  },
  {
    component: "switch",
    // The root: it carries no part name.
    part: "",
    variant: "",
    state: "",
    page: "/",
    property: "gap",
    reason: "a switch with a hidden label drops the gap that separates the label, so the stage's lights switch lines up with its row's end",
    source: "site/src/voyage/stage/stage.tsx: <Switch label={STAGE_COPY.lights} hideLabel />",
  },
];

export const matched = new Set<number>();

// Pixel findings read `<key>|<size>|<behind> looks different on <pages>`; property findings `<key> on <pages>: <parts>`.
export function waived(line: string): boolean {
  const pixels = / looks different on (.*)$/.exec(line);
  const props = /^(.*?) on ([^:]*): (.*)$/.exec(line);
  const [key, pages, property] = pixels ? [line.slice(0, pixels.index), pixels[1]!, "pixels"] : props ? [props[1]!, props[2]!, props[3]!] : ["", "", ""];
  const parts = key.replace(/^grouped /, "").split("|");
  if (pixels) parts.length -= 2;
  const only = pages.split(", ");
  return WAIVERS.some((w, i) => {
    const ok =
      covers(w, parts, only) &&
      (w.property === "pixels" ? pixels !== null : property.split(" ; ").every((p) => p.startsWith(w.property)));
    if (ok) matched.add(i);
    return ok;
  });
}

const states = ["hover", "active", "focus"];

/** Whether a waiver is for this look (its key's parts) on exactly these pages, whatever property differs. */
function covers(w: Waiver, parts: string[], pages: string[]): boolean {
  const state = parts[parts.length - 1]!;
  return (
    parts[0] === w.component &&
    parts[1] === w.part &&
    (w.variant === "" || (parts[3] ?? "").includes(`data-variant=${w.variant}`)) &&
    (w.state === "*" || (w.state === "" ? !states.includes(state) : state === w.state)) &&
    pages.length === 1 &&
    pages[0] === w.page
  );
}

/**
 * Whether a waiver is for a look's key on these pages. A sweep that took two samples of a look, one on a waived page,
 * makes the waived page the odd one out, so the finding names it and the waiver can match (#2249).
 */
export function waivedPages(key: string, pages: string[]): boolean {
  const parts = key.replace(/^grouped /, "").split("|");
  return WAIVERS.some((w) => covers(w, parts, [...new Set(pages)]));
}

// Each sweep writes the waivers it used beside the timings CI uploads; scripts/waivers.mjs fails on one no run used.
export function recordMatched(label: string): void {
  const dir = ".tmp/timings";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/waivers-${label}.json`, JSON.stringify([...matched]));
}
