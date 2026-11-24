import { useSyncExternalStore, type JSX } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { href } from "../paths";
import { patternStories, type PatternName } from "./pattern-names";

function watchScheme(notify: () => void): () => void {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** The Storybook story that renders a pattern whole, in the scheme the docs page shows. */
export function patternStoryUrl(name: PatternName, dark: boolean, framed = false): string {
  return href(`/storybook/iframe.html?id=reference-patterns--${patternStories[name]}&viewMode=story${dark ? "&globals=theme:dark" : ""}${framed ? "&preview=1" : ""}`);
}

/**
 * A pattern drawn live, in the frame Storybook already serves: its own page and colour scheme toggle stay inside the
 * frame, and the docs page loads none of its code.
 */
export function PatternPreview({ name }: { name: PatternName }): JSX.Element {
  // Read once hydrated, so the server's light page and the browser's first render agree.
  const dark = useSyncExternalStore(watchScheme, () => document.documentElement.classList.contains("dark"), () => false);
  const url = patternStoryUrl(name, dark);
  // The frame never scrolls, so a wheel or a swipe over it still scrolls the docs page; the full size link shows the rest.
  const frameUrl = patternStoryUrl(name, dark, true);
  return (
    <figure className="mt-6 mb-0 grid gap-2">
      <iframe key={String(dark)} data-pattern-frame src={frameUrl} title={`${name} pattern, live`} loading="lazy" className="block h-[34rem] w-full rounded-ouro-lg border border-border bg-background" />
      <figcaption className="text-sm">
        <Link href={url} external tone="secondary">
          Open full size
        </Link>
      </figcaption>
    </figure>
  );
}
