import { useSyncExternalStore, type JSX } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { href } from "../paths";

/** The page patterns that have a story, by the name `registry/ouro/patterns/<name>` gives them. */
export const patternStories = { "settings-page": "settings", "dashboard-page": "dashboard", "list-detail-page": "list-detail" } as const;

export type PatternName = keyof typeof patternStories;

function watchScheme(notify: () => void): () => void {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** The Storybook story that renders a pattern whole, in the scheme the docs page shows. */
export function patternStoryUrl(name: PatternName, dark: boolean): string {
  return href(`/storybook/iframe.html?id=reference-patterns--${patternStories[name]}&viewMode=story${dark ? "&globals=theme:dark" : ""}`);
}

/**
 * A pattern drawn live, in the frame Storybook already serves: its own page and colour scheme toggle stay inside the
 * frame, and the docs page loads none of its code.
 */
export function PatternPreview({ name }: { name: PatternName }): JSX.Element {
  // Read once hydrated, so the server's light page and the browser's first render agree.
  const dark = useSyncExternalStore(watchScheme, () => document.documentElement.classList.contains("dark"), () => false);
  const url = patternStoryUrl(name, dark);
  return (
    <figure className="mt-6 mb-0 grid gap-2">
      <iframe key={String(dark)} data-pattern-frame src={url} title={`${name} pattern, live`} loading="lazy" className="block h-[34rem] w-full rounded-ouro-lg border border-border bg-background" />
      <figcaption className="text-sm">
        <Link href={url} external tone="secondary">
          Open full size
        </Link>
      </figcaption>
    </figure>
  );
}
