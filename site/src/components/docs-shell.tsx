import { lazy, Suspense, type JSX, type ReactNode } from "react";
import { Container, SiteFooter } from "./layout";
import { Popups, PopupsProvider } from "./popups";

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

/** Docs pages: the sidebar beside the page from 640px up; on smaller screens it opens as a drawer. */
export function DocsShell({ current, children }: { current: string; children: ReactNode }): JSX.Element {
  return (
    <PopupsProvider>
      <Suspense>
        <DocsHeader current={current} />
      </Suspense>
      <Container className="sm:grid sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-8 lg:gap-12">
        <aside className="max-sm:border-b max-sm:border-border max-sm:pb-2">
          <Suspense>
            <DocsSidebar current={current} />
          </Suspense>
        </aside>
        <div className="min-w-0">
          <main className="max-w-3xl pt-8 lg:pt-10">
            {children}
            <Popups />
          </main>
        </div>
      </Container>
      <SiteFooter />
    </PopupsProvider>
  );
}
