// The components, read from each folder's manifest, so adding a component touches only its
// own folder. registry/ouro/components/ouro/<folder>/component.json:
//
//   { "order": 70, "components": ["text-field", "text-area"] }
//
// `components` lists the file stems in the folder that are components (`<stem>.tsx`, item
// name `<stem>`, export name the stem in PascalCase). `order` places the folder in the
// registry and wherever else components are listed in order; ties sort by folder name.
// scripts/registry.mts, scripts/gen-docs.mts and the tests read this list.
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
      const manifest = JSON.parse(readFileSync(file, "utf8")) as { order?: unknown; components?: unknown };
      const stems = manifest.components;
      if (typeof manifest.order !== "number" || !Array.isArray(stems) || stems.length === 0 || !stems.every((stem) => typeof stem === "string" && /^[a-z][a-z0-9-]*$/.test(stem))) {
        throw new Error(`${componentsDir}${entry.name}/${MANIFEST} needs a numeric "order" and a non-empty "components" list of kebab-case file stems.`);
      }
      for (const stem of stems as string[]) {
        if (!existsSync(join(dir, entry.name, `${stem}.tsx`))) throw new Error(`${componentsDir}${entry.name}/${MANIFEST} lists ${stem}, but ${stem}.tsx is not in the folder.`);
      }
      return { folder: entry.name, order: manifest.order, stems: stems as string[] };
    })
    .sort((a, b) => a.order - b.order || (a.folder < b.folder ? -1 : 1));
  return folders.flatMap(({ folder, stems }) => stems.map((stem) => ({ name: stem, folder, stem, title: pascal(stem) })));
}
