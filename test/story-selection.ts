export { storyFileSelected };

// Which story files the shared suites render on a pull request's reduced run (test/stories.tsx,
// scripts/test-impact.mjs): kept apart from Vite's glob so the script tests can check it.

/**
 * Whether the story file at `path` (as test/stories.tsx's glob names it) is rendered, given the
 * component folders the run selected, or null for every story. A component's stories render when
 * its folder is selected. The reference stories (stories/), which no folder owns and which render
 * the shared components (sheet-feel: Button and Sheet), render on every run: they are one file,
 * and selecting them by import would need a second graph for repository-only code.
 */
function storyFileSelected(path: string, selected: ReadonlySet<string> | null): boolean {
  if (selected === null) return true;
  const folder = /\/components\/ouro\/([\w-]+)\//.exec(path)?.[1];
  return folder === undefined || selected.has(folder);
}
