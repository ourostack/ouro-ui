import { mkdirSync, writeFileSync } from "node:fs";

// A waiver is one difference one page makes on purpose. It names one component, part, variant, state, page and
// property, and says why and where the page's own source asks for it. A waiver that matches nothing fails the
// stale check (scripts/waivers.mjs), so this list only shrinks.
export type Waiver = {
  component: string;
  part: string;
  variant: string;
  state: string;
  page: string;
  property: string;
  reason: string;
  source: string;
};

export const WAIVERS: Waiver[] = [
  { component: "switch", part: "track", variant: "", state: "", page: "/apple/feel/", property: "border", reason: "the off Switch draws its outline as a border", source: "registry/ouro/components/ouro/switch/switch-styles.ts" },
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
      parts[0] === w.component &&
      parts[1] === w.part &&
      (w.variant === "" || (parts[3] ?? "").includes(`data-variant=${w.variant}`)) &&
      (w.state === "" ? !["hover", "active", "focus"].includes(parts[parts.length - 1]!) : parts[parts.length - 1] === w.state) &&
      only.length === 1 &&
      only[0] === w.page &&
      (w.property === "pixels" ? pixels !== null : property.split(" ; ").every((p) => p.startsWith(w.property)));
    if (ok) matched.add(i);
    return ok;
  });
}

// Each sweep writes the waivers it used beside the timings CI uploads; scripts/waivers.mjs fails on one no run used.
export function recordMatched(label: string): void {
  const dir = ".tmp/timings";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/waivers-${label}.json`, JSON.stringify([...matched]));
}
