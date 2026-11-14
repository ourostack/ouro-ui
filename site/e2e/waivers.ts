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
  { component: "button", part: "root", variant: "outline", state: "", page: "/docs/edit-sheet/", property: "border", reason: "the demo sets tone=secondary, a prop that leaves no attribute", source: "site/src/docs/demos/edit-sheet.demo.tsx" },
  { component: "button", part: "root", variant: "outline", state: "", page: "/docs/card/", property: "border", reason: "the demo sets tone=secondary, a prop that leaves no attribute", source: "site/src/docs/demos/card.demo.tsx" },
  { component: "button", part: "root", variant: "outline", state: "", page: "/docs/porthole/", property: "border", reason: "the demo sets tone=secondary, a prop that leaves no attribute", source: "site/src/docs/demos/porthole.demo.tsx" },
  { component: "button", part: "root", variant: "outline", state: "", page: "/docs/route-progress/", property: "border", reason: "the demo sets tone=secondary, a prop that leaves no attribute", source: "site/src/docs/demos/route-progress.demo.tsx" },
  { component: "button", part: "root", variant: "outline", state: "", page: "/docs/separator/", property: "border", reason: "the demo sets tone=secondary, a prop that leaves no attribute", source: "site/src/docs/demos/separator.demo.tsx" },
  { component: "button", part: "root", variant: "solid", state: "", page: "/nautilus/", property: "background", reason: "the squid button is tone=destructive, a prop that leaves no attribute", source: "site/src/voyage/chapters/chapter-three.tsx" },
  { component: "button", part: "root", variant: "soft", state: "", page: "/docs/ouro-mcp-app/", property: "icons", reason: "the demo's button holds no icon", source: "site/src/docs/demos/ouro-mcp-app.demo.tsx" },
  { component: "button", part: "root", variant: "soft", state: "", page: "/docs/a2ui-surface/", property: "icons", reason: "the demo's button holds no icon", source: "site/src/docs/demos/a2ui-surface.demo.tsx" },
  { component: "switch", part: "track", variant: "", state: "", page: "/apple/feel/", property: "border", reason: "the off Switch draws its outline as a border", source: "registry/ouro/components/ouro/switch/switch-styles.ts" },
  { component: "checkbox", part: "box", variant: "", state: "hover", page: "/docs/checkbox-group/", property: "pixels", reason: "the crop includes the group's own surface beside the box", source: "site/src/docs/demos/checkbox-group.demo.tsx" },
  { component: "number-field", part: "increment", variant: "", state: "hover", page: "/docs/number-field/", property: "pixels", reason: "the crop includes the field's edge beside the stepper", source: "site/src/docs/demos/number-field.demo.tsx" },
  { component: "slider", part: "thumb", variant: "", state: "focus", page: "/", property: "outline", reason: "the home slider shows focus as a ring drawn on its track", source: "site/src/voyage/hero.tsx" },
];

export const matched = new Set<number>();

// Pixel findings read `<key>|<size>|<behind> looks different on <pages>`; property findings `<key> on <pages>: <parts>`.
export function waived(line: string): boolean {
  const pixels = / looks different on (.*)$/.exec(line);
  const props = /^(.*?) on ([^:]*): (.*)$/.exec(line);
  const [key, pages, property] = pixels ? [line.slice(0, pixels.index), pixels[1]!, "pixels"] : props ? [props[1]!, props[2]!, props[3]!] : ["", "", ""];
  const parts = key.replace(/^grouped /, "").split("|");
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
