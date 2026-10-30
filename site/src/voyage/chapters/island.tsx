import { lazy, Suspense, type ComponentType, type JSX } from "react";

/**
 * Resolves once the element with this id comes within half a screen of the viewport, or at once
 * where there is no such element or no IntersectionObserver.
 */
export function nearScreen(id: string): Promise<void> {
  return new Promise((resolve) => {
    const element = document.getElementById(id);
    if (!element || typeof IntersectionObserver === "undefined") {
      resolve();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        resolve();
      },
      { rootMargin: "50% 0px" },
    );
    observer.observe(element);
  });
}

/**
 * Each chapter as an island (site-design.md: each chapter "hydrated when it nears the viewport"). The
 * server renders it whole, so it reads before any JavaScript; in the browser its chunk loads only
 * as the chapter nears the screen, and React hydrates the server's HTML then. Until that moment the
 * page's own closure carries none of its code.
 */
function island(id: string, load: () => Promise<{ default: ComponentType }>): () => JSX.Element {
  const Chapter = lazy(() => (import.meta.env.SSR ? load() : nearScreen(id).then(load)));
  return function Island(): JSX.Element {
    return (
      <Suspense>
        <Chapter />
      </Suspense>
    );
  };
}

export const ChapterOneIsland = island("chapter-one", () => import("./chapter-one"));

/** Chapter II: its Chart, and Recharts with it, load only with this island, never with the page. */
export const ChapterTwoIsland = island("chapter-two", () => import("./chapter-two"));

export const ChapterThreeIsland = island("chapter-three", () => import("./chapter-three"));

/** The home page's agents and install sections, as an island in the same way (home-reference.tsx). */
export const HomeReferenceIsland = island("reference", () => import("../home-reference"));
