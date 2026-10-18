// The components, read from each folder's manifest, so adding a component touches only its
// own folder. registry/ouro/components/ouro/<folder>/component.json:
//
//   { "order": 70, "components": ["text-field", "text-area"] }
//
// `components` lists the file stems in the folder that are components (`<stem>.tsx`, item
// name `<stem>`, export name the stem in PascalCase). `order` places the folder in the
// registry and wherever else components are listed in order; ties sort by folder name.
// scripts/registry.mts, scripts/gen-docs.mts and the tests read this list.
//
// Two optional keys describe the controls each component renders (scripts/control-matrix.mts):
//
//   "modes": { "button": ["button", "link"] }
//   "controls": { "button": [{ "part": "root", "role": "button", "portal": false, "modes": ["button"] }, …] }
//
// `modes` names the ways a component renders different controls (a discriminated union in its
// props), the first being what a story renders unless its `parameters.mode` says otherwise.
// `controls` lists every element of a component a person can focus or operate: the part name its
// `data-ouro-part` carries, its ARIA role, whether it renders in a portal outside the component,
// and the modes it appears in (all of them when left out).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const componentsDir = "registry/ouro/components/ouro/";
export const MANIFEST = "component.json";

export interface Component {
  /** The registry item name, also the docs page: `text-field`. */
  name: string;
  /** The folder under registry/ouro/components/ouro/. */
  folder: string;
  /** The file stem: `<folder>/<stem>.tsx`. */
  stem: string;
  /** The export name: `TextField`. */
  title: string;
  /** The modes from component.json `modes`, when the component declares some. */
  modes?: string[];
  /** The controls from component.json `controls`, when the component renders any. */
  controls?: ControlPart[];
}

/** One element of a component that a person can focus or operate (component.json `controls`). */
export interface ControlPart {
  /** The `data-ouro-part` value: `trigger`, `option`, `close`. */
  part: string;
  /** Its ARIA role, explicit or implied by the element: `button`, `combobox`, `option`. */
  role: string;
  /** Whether it renders in a portal, outside the component's root. */
  portal: boolean;
  /** The modes it renders in; every mode when left out. */
  modes?: string[];
}

const kebab = /^[a-z][a-z0-9-]*$/;
const isNames = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((name) => typeof name === "string" && kebab.test(name)) && new Set(value).size === value.length;

/** Reads and checks a folder's optional `modes` and `controls`, keyed by stem. */
function readControls(where: string, stems: string[], manifest: { modes?: unknown; controls?: unknown }) {
  const modes = (manifest.modes ?? {}) as Record<string, unknown>;
  const controls = (manifest.controls ?? {}) as Record<string, unknown>;
  for (const [key, keyed] of [["modes", modes], ["controls", controls]] as const) {
    for (const stem of Object.keys(keyed)) {
      if (!stems.includes(stem)) throw new Error(`${where} ${key} names ${stem}, which "components" does not list.`);
    }
  }
  for (const [stem, list] of Object.entries(modes)) {
    if (!isNames(list) || list.length < 2) throw new Error(`${where} "modes" for ${stem} needs at least two modes, unique kebab-case names.`);
  }
  for (const [stem, list] of Object.entries(controls)) {
    if (!Array.isArray(list) || list.length === 0) throw new Error(`${where} "controls" for ${stem} needs a non-empty list of parts.`);
    const stemModes = (modes[stem] ?? []) as string[];
    const seen = new Set<string>();
    for (const entry of list as Array<Record<string, unknown>>) {
      if (typeof entry.part !== "string" || !kebab.test(entry.part) || typeof entry.role !== "string" || !/^[a-z]+$/.test(entry.role) || typeof entry.portal !== "boolean") {
        throw new Error(`${where} each of ${stem}'s "controls" needs a part, a role and portal: { "part": "trigger", "role": "button", "portal": false }.`);
      }
      if (entry.modes !== undefined && !isNames(entry.modes)) throw new Error(`${where} ${stem}'s ${entry.part} needs "modes" to be a non-empty list of mode names.`);
      const partModes = (entry.modes as string[] | undefined) ?? (stemModes.length > 0 ? stemModes : [""]);
      for (const mode of partModes) {
        if (entry.modes !== undefined && !stemModes.includes(mode)) throw new Error(`${where} ${stem}'s ${entry.part} names mode ${mode}, which ${stem} does not declare in "modes".`);
        if (seen.has(`${entry.part} ${mode}`)) throw new Error(`${where} lists ${stem}'s ${entry.part} twice${mode ? ` in mode ${mode}` : ""}.`);
        seen.add(`${entry.part} ${mode}`);
      }
    }
  }
  return { modes: modes as Record<string, string[]>, controls: controls as Record<string, ControlPart[]> };
}

/** `text-field` to `TextField`. */
export const pascal = (stem: string) => stem.replace(/(^|-)([a-z])/g, (_, _dash: string, letter: string) => letter.toUpperCase());

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every component, in registry order. Throws on a folder without a valid manifest. */
export function readComponents(root: string = repoRoot): Component[] {
  const dir = join(root, componentsDir);
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = join(dir, entry.name, MANIFEST);
      if (!existsSync(file)) throw new Error(`${componentsDir}${entry.name}/ has no ${MANIFEST}. Add one: { "order": <number>, "components": ["<stem>"] }.`);
      const manifest = JSON.parse(readFileSync(file, "utf8")) as { order?: unknown; components?: unknown; modes?: unknown; controls?: unknown };
      const stems = manifest.components;
      if (typeof manifest.order !== "number" || !Array.isArray(stems) || stems.length === 0 || !stems.every((stem) => typeof stem === "string" && /^[a-z][a-z0-9-]*$/.test(stem))) {
        throw new Error(`${componentsDir}${entry.name}/${MANIFEST} needs a numeric "order" and a non-empty "components" list of kebab-case file stems.`);
      }
      for (const stem of stems as string[]) {
        if (!existsSync(join(dir, entry.name, `${stem}.tsx`))) throw new Error(`${componentsDir}${entry.name}/${MANIFEST} lists ${stem}, but ${stem}.tsx is not in the folder.`);
      }
      const { modes, controls } = readControls(`${componentsDir}${entry.name}/${MANIFEST}`, stems as string[], manifest);
      return { folder: entry.name, order: manifest.order, stems: stems as string[], modes, controls };
    })
    .sort((a, b) => a.order - b.order || (a.folder < b.folder ? -1 : 1));
  return folders.flatMap(({ folder, stems, modes, controls }) =>
    stems.map((stem) => ({
      name: stem,
      folder,
      stem,
      title: pascal(stem),
      ...(modes[stem] ? { modes: modes[stem] } : {}),
      ...(controls[stem] ? { controls: controls[stem] } : {}),
    })),
  );
}
