import { lazy, Suspense, type JSX, type ReactNode } from "react";
import type { SceneName } from "../storybook";
import { Container, SiteFooter } from "./layout";
import { Popups, PopupsProvider } from "./popups";
import { StoryWorld } from "./story-world";

/**
 * The docs sidebar as an island, the way the voyage loads Chapter I (site/src/voyage/chapters/island.tsx):
 * the server renders it whole, so its links work before any JavaScript, and its code (the Sidebar, its
 * filter and their Base UI parts) loads after the page's own closure, then hydrates that HTML.
 */
const DocsSidebar = lazy(() => import("./docs-sidebar"));

/**
 * The site's one header (voyage/header.tsx), an island in the same way: its links are in the server's
 * HTML, and its theme picker, X-ray and search load after the page's own closure, so the docs keep
 * their first-load budget (site/e2e/catalog.spec.ts).
 */
const DocsHeader = lazy(() => import("./docs-header"));

/** The sidebar's column and the page's, shared by the sky and the page so the title sits over the words it names. */
const COLUMNS = "sm:grid sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-8 lg:gap-12";

/** A docs page's arrival: the storybook scene it opens on, full width, with its eyebrow and title in the sky. */
export interface DocsOpener {
  scene: SceneName;
  eyebrow: ReactNode;
  title: ReactNode;
  /** The docs' front door and the platform pages open on a taller scene; the rest on a band, so their words come soon. */
  tall?: boolean;
}

/**
 * Docs pages open the way the home page does: in Ouro's meadow, edge to edge, the title in the sky, with
 * nothing framed. Then the sidebar beside the page from 640px up; on smaller screens the header's menu holds its links.
 * The title's scene is a named region of its own, so the sidebar stays a landmark beside <main>, not inside it.
 */
export function DocsShell({ current, opener, children }: { current: string; opener?: DocsOpener; children: ReactNode }): JSX.Element {
  return (
    <PopupsProvider>
      <Suspense>
        <DocsHeader current={current} />
      </Suspense>
      {opener && (
        <section aria-labelledby="page-title">
          <StoryWorld scene={opener.scene} className={opener.tall ? "story-world-short story-world-still" : "story-world-docs story-world-still"} decorative>
            <Container className={COLUMNS}>
              <div className="max-sm:hidden" />
              <div className="min-w-0 max-w-3xl">
                <p className="story-world-eyebrow">{opener.eyebrow}</p>
                <h1 id="page-title" className="story-world-title">
                  {opener.title}
                </h1>
              </div>
            </Container>
          </StoryWorld>
        </section>
      )}
      <Container className={COLUMNS}>
        {/* Below 640px the header's one menu lists the docs too (voyage/site-menu.tsx), so the sidebar steps aside. */}
        <aside className={opener ? "max-sm:hidden sm:pt-2 lg:pt-4" : "max-sm:hidden"}>
          <Suspense>
            <DocsSidebar current={current} />
          </Suspense>
        </aside>
        <div className="min-w-0">
          <main className={opener ? "max-w-3xl pt-6 lg:pt-8" : "max-w-3xl pt-8 lg:pt-10"}>
            {children}
            <Popups />
          </main>
        </div>
      </Container>
      <SiteFooter />
    </PopupsProvider>
  );
}
