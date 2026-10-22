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
// the modes it appears in (all of them when left out), and `"touch": true` when only a coarse
// pointer reaches it (Combobox's sheet), so the ouro-touch project checks it.
//
// A third, `motion`, says what each state change animates, part by part (readMotion below,
// scripts/motion-coverage.mts):
//
//   "motion": { "checkbox": { "states": { "data-checked": { "kind": "motion",
//     "parts": { "tick": { "properties": ["opacity", "scale"], "reduced": ["opacity"] } },
//     "tests": ["<file>::<full test name>"] } } } }
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { componentsDir } from "./components-dir.mts";
import { MOTION_KINDS, STATE_ATTRIBUTES } from "./motion-states.mts";

export { componentsDir };
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
  /** Whether only a coarse pointer reaches it, so the ouro-touch project checks it. */
  touch?: boolean;
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
      if (entry.touch !== undefined && entry.touch !== true) throw new Error(`${where} ${stem}'s ${entry.part} takes "touch": true or no "touch" at all.`);
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

/** What one part does in a state: the CSS properties that run, normally and with reduced motion. */
export interface MotionPart {
  /** The properties that transition or animate, as CSS names (`opacity`, `border-color`). */
  properties: string[];
  /** The properties that run with `prefers-reduced-motion: reduce`; empty when nothing does. */
  reduced: string[];
}

/** One state of a component's `motion` map, keyed by its attribute (`data-checked`, `data-swiping=left`). */
export interface MotionState {
  /** `motion` (CSS transitions or animations), `gesture-settle` (a released drag settling) or `none`. */
  kind: "motion" | "gesture-settle" | "none";
  /** The parts that move, by `data-ouro-part`; required for `motion` and `gesture-settle`, absent for `none`. */
  parts?: Record<string, MotionPart>;
  /** The tests that prove it, as `<file>::<full test name>` (describe titles and title joined by ` > `). */
  tests: string[];
}

/** A change from one state to another that the map holds to, such as one interrupted mid-animation. */
export interface MotionTransition {
  from: string;
  to: string;
  /** Whether the change arrives while the first one is still animating. */
  interrupt: boolean;
  tests: string[];
}

/** A gesture whose settle the map holds to. */
export interface MotionGesture {
  name: string;
  tests: string[];
}

/** A stem's component.json `motion`. */
export interface MotionMap {
  states: Record<string, MotionState>;
  transitions?: MotionTransition[];
  gestures?: MotionGesture[];
}

/** A component that declares `motion`. */
export interface MotionComponent {
  name: string;
  folder: string;
  stem: string;
  motion: MotionMap;
}

const cssName = /^-?[a-z][a-z-]*$/;
const stateKey = /^(data-[a-z][a-z-]*)(?:=[a-z0-9][a-z0-9-]*)?$/;
const isCssNames = (value: unknown, allowEmpty: boolean): value is string[] =>
  Array.isArray(value) && (allowEmpty || value.length > 0) && value.every((name) => typeof name === "string" && cssName.test(name));
const isState = (key: string) => STATE_ATTRIBUTES.includes(stateKey.exec(key)?.[1] ?? "");

/** Every `data-ouro-part` value a stem's runtime files write: in JSX, a props object, `setAttribute`, or a marker helper. */
function renderedParts(folder: string, stem: string): Set<string> {
  const parts = new Set<string>();
  for (const name of [`${stem}.tsx`, `${stem}-parts.tsx`, `${stem}-styles.ts`]) {
    const file = join(folder, name);
    if (!existsSync(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/data-ouro-part["']?\s*[=:,]\s*("[a-z-]+"|\{[^}]*\})/g)) {
      const value = match[1]!;
      for (const part of value.startsWith("{") ? [...value.matchAll(/"([a-z-]+)"/g)].map((found) => found[1]!) : [value.slice(1, -1)]) parts.add(part);
    }
    for (const match of source.matchAll(/\b(?:controlRef|\w+Marker)\(\s*"[a-z-]+",\s*"([a-z-]+)"\s*\)/g)) parts.add(match[1]!);
  }
  return parts;
}

/** Checks a list of test ids: each `<file>::<a > b > c>`, the file real and every title in it as a string literal. */
function checkTests(root: string, where: string, owner: string, tests: unknown): string[] {
  if (!Array.isArray(tests) || tests.length === 0 || !tests.every((id) => typeof id === "string") || new Set(tests).size !== tests.length) {
    throw new Error(`${where} ${owner} needs "tests": a non-empty list of distinct test ids, each <file>::<full test name>.`);
  }
  for (const id of tests as string[]) {
    const [file, name] = id.split("::");
    if (!file || !name || id.split("::").length !== 2) throw new Error(`${where} ${owner} names test "${id}", which is not <file>::<full test name> (titles joined by " > ").`);
    const path = join(root, file);
    if (!existsSync(path)) throw new Error(`${where} ${owner} names test "${id}", but that file does not exist.`);
    const source = readFileSync(path, "utf8");
    for (const title of name.split(" > ")) {
      if (![`"${title}"`, `'${title}'`, `\`${title}\``].some((literal) => source.includes(literal))) {
        throw new Error(`${where} ${owner} names test "${id}", but ${basename(file)} has no test or describe titled "${title}".`);
      }
    }
  }
  return tests as string[];
}

/** Checks one stem's `motion` against the closed state list, the stem's rendered parts and the test files. */
function checkMotion(root: string, where: string, folder: string, stem: string, motion: unknown): MotionMap {
  const map = (motion ?? {}) as Record<string, unknown>;
  const states = map["states"] as Record<string, Record<string, unknown>> | undefined;
  if (typeof states !== "object" || states === null || Array.isArray(states) || Object.keys(states).length === 0) {
    throw new Error(`${where} ${stem}'s "motion" needs "states": { "<attribute>": { "kind": …, "tests": […] } }.`);
  }
  const rendered = renderedParts(folder, stem);
  for (const [key, state] of Object.entries(states)) {
    const owner = `${stem}'s ${key}`;
    if (!isState(key)) throw new Error(`${where} ${owner} is not a state attribute: a state is one of STATE_ATTRIBUTES in scripts/motion-states.mts, optionally with =<value>.`);
    if (!MOTION_KINDS.includes(state.kind as string)) throw new Error(`${where} ${owner}: "kind" must be "motion", "gesture-settle" or "none".`);
    const parts = state.parts as Record<string, Record<string, unknown>> | undefined;
    if (state.kind === "none") {
      if (parts !== undefined) throw new Error(`${where} ${owner} is "none", so it declares no "parts".`);
    } else {
      if (typeof parts !== "object" || parts === null || Array.isArray(parts) || Object.keys(parts).length === 0) {
        throw new Error(`${where} ${owner} is "${String(state.kind)}", so it needs "parts": { "<data-ouro-part>": { "properties": […], "reduced": […] } }.`);
      }
      for (const [part, entry] of Object.entries(parts)) {
        if (!isCssNames(entry.properties, false)) throw new Error(`${where} ${owner} ${part} needs "properties": a non-empty list of CSS property names.`);
        if (!isCssNames(entry.reduced, true)) throw new Error(`${where} ${owner} ${part} needs "reduced": the CSS properties that run with reduced motion, [] when none do.`);
        for (const list of [entry.properties, entry.reduced] as string[][]) {
          const twice = list.find((name, index) => list.indexOf(name) !== index);
          if (twice) throw new Error(`${where} ${owner} ${part} lists ${twice} twice.`);
        }
        if (!rendered.has(part)) throw new Error(`${where} ${owner} names part ${part}, but ${stem} never renders data-ouro-part="${part}".`);
      }
    }
    checkTests(root, where, owner, state.tests);
  }
  const transitions = map["transitions"];
  if (transitions !== undefined) {
    if (!Array.isArray(transitions)) throw new Error(`${where} ${stem}'s transitions each need "from", "to", "interrupt" and "tests".`);
    for (const transition of transitions as Array<Record<string, unknown>>) {
      if (typeof transition.from !== "string" || typeof transition.to !== "string" || typeof transition.interrupt !== "boolean") {
        throw new Error(`${where} ${stem}'s transitions each need "from", "to", "interrupt" and "tests".`);
      }
      const owner = `${stem}'s transition ${transition.from} to ${transition.to}`;
      for (const end of [transition.from, transition.to]) if (!isState(end)) throw new Error(`${where} ${owner} names ${end}, which is not a state attribute.`);
      checkTests(root, where, owner, transition.tests);
    }
  }
  const gestures = map["gestures"];
  if (gestures !== undefined) {
    if (!Array.isArray(gestures) || !gestures.every((gesture: Record<string, unknown>) => typeof gesture.name === "string" && kebab.test(gesture.name) && Array.isArray(gesture.tests) && gesture.tests.length > 0)) {
      throw new Error(`${where} ${stem}'s gestures each need a kebab-case "name" and "tests".`);
    }
    for (const gesture of gestures as Array<Record<string, unknown>>) checkTests(root, where, `${stem}'s gesture ${String(gesture.name)}`, gesture.tests);
  }
  return map as unknown as MotionMap;
}

/**
 * Every component whose component.json declares `motion`, in registry order, each map checked:
 * states from the closed list, known kinds, parts the stem renders as `data-ouro-part`, property
 * lists without duplicates, and test ids whose titles are in their files. Components without
 * `motion` are left out: the map is not required yet.
 */
export function readMotion(root: string = repoRoot): MotionComponent[] {
  const dir = join(root, componentsDir);
  const byFolder = new Map<string, Record<string, unknown>>();
  const result: MotionComponent[] = [];
  for (const component of readComponents(root)) {
    if (!byFolder.has(component.folder)) {
      const where = `${componentsDir}${component.folder}/${MANIFEST}`;
      const manifest = JSON.parse(readFileSync(join(dir, component.folder, MANIFEST), "utf8")) as { components: string[]; motion?: Record<string, unknown> };
      for (const stem of Object.keys(manifest.motion ?? {})) {
        if (!manifest.components.includes(stem)) throw new Error(`${where} motion names ${stem}, which "components" does not list.`);
      }
      byFolder.set(component.folder, manifest.motion ?? {});
    }
    const motion = byFolder.get(component.folder)![component.stem];
    if (motion === undefined) continue;
    const where = `${componentsDir}${component.folder}/${MANIFEST}`;
    result.push({ name: component.name, folder: component.folder, stem: component.stem, motion: checkMotion(root, where, join(dir, component.folder), component.stem, motion) });
  }
  return result;
}
