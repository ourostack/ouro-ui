import { lazy, Suspense, type JSX } from "react";

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
 * Chapter I as an island (site-design.md: each chapter "hydrated when it nears the viewport"). The
 * server renders it whole, so it reads before any JavaScript; in the browser its chunk loads only
 * as the chapter nears the screen, and React hydrates the server's HTML then. Until that moment the
 * page's own closure carries none of its code.
 */
const ChapterOne = lazy(() => (import.meta.env.SSR ? import("./chapter-one") : nearScreen("chapter-one").then(() => import("./chapter-one"))));

export function ChapterOneIsland(): JSX.Element {
  return (
    <Suspense>
      <ChapterOne />
    </Suspense>
  );
}
