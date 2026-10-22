import { composeStories, setProjectAnnotations } from "@storybook/react";
import type { ComponentType } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// What runs inside one of the hydration check's frames (hydration.test.tsx): a page of its own,
// with its own copy of every module, so what one locale caches at module level (an
// `Intl.NumberFormat` kept per options, a date formatter) is never what another reads, as on a
// real server and in a real reader's browser. The test loads this module into a fresh iframe and
// calls these functions through the frame's window.

setProjectAnnotations([]);

const storyModules = import.meta.glob<Parameters<typeof composeStories>[0]>(["../../registry/**/*.stories.tsx", "../../stories/**/*.stories.tsx", "../fixtures/conformance/*.stories.tsx"]);

/** `text-field.stories.tsx` to `TextField`, as test/stories.tsx names story files. */
const fileKey = (path: string) => path.replace(/^.*\/([\w-]+)\.stories\.tsx$/, "$1").replace(/(^|-)([a-z])/g, (_, _dash: string, letter: string) => letter.toUpperCase());

/** The story `File/Export`, composed as test/stories.tsx composes it. */
async function load(id: string): Promise<ComponentType> {
  const [file, name = ""] = id.split("/");
  const path = Object.keys(storyModules).find((candidate) => fileKey(candidate) === file);
  if (!path) throw new Error(`no story file for ${id}`);
  const story = (composeStories(await storyModules[path]!()) as Record<string, ComponentType>)[name];
  if (!story) throw new Error(`no story ${id}`);
  return story;
}

/** The story's server HTML, or the error a server render throws. */
export async function serverHtml(id: string): Promise<{ html: string } | { error: string }> {
  const Story = await load(id);
  try {
    return { html: renderToString(<Story />) };
  } catch (error) {
    return { error: String((error as Error).message ?? error) };
  }
}

let root: Root | undefined;
const host = document.body.appendChild(document.createElement("div"));

/**
 * Hydrates `html` with the story, then reports every mismatch: React's recoverable errors and the
 * attribute mismatches it logs instead, each with the lines React marks + (client) and - (server).
 */
export async function hydrate(id: string, html: string): Promise<string[]> {
  const Story = await load(id);
  await unmount();
  host.innerHTML = html;
  const problems: string[] = [];
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await act(async () => {
      root = hydrateRoot(host, <Story />, { onRecoverableError: (error) => problems.push(String((error as Error).message ?? error).split("\n")[0] ?? "") });
    });
    // Effects that run after hydration (a store read once mounted) settle before the check ends.
    for (let frame = 0; frame < 3; frame += 1) await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  } finally {
    console.error = original;
  }
  for (const text of logged) {
    const diff = text.split("\n").filter((line) => /^\s*[+-]\s/.test(line));
    problems.push(`${text.split("\n")[0]}${diff.length ? `\n${diff.join("\n")}` : ""}`);
  }
  return problems;
}

/** Unmounts the hydrated story, if any. */
export async function unmount(): Promise<void> {
  const current = root;
  root = undefined;
  if (current) await act(async () => current.unmount());
  host.replaceChildren();
}

/** `navigator.language` and `languages` as the reader's browser reports them; CDP leaves them alone. */
export function setLanguage(locale: string): void {
  for (const [name, value] of [
    ["language", locale],
    ["languages", [locale]],
  ] as const) {
    Object.defineProperty(navigator, name, { configurable: true, get: () => value });
  }
}
