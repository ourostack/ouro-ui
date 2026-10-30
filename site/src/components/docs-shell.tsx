import { lazy, Suspense, type JSX, type ReactNode } from "react";
import { Container, SiteFooter, SiteHeader } from "./layout";
import { Popups, PopupsProvider } from "./popups";

/**
 * The docs sidebar as an island, the way the voyage loads Chapter I (site/src/voyage/chapters/island.tsx):
 * the server renders it whole, so its links work before any JavaScript, and its code (the Sidebar, its
 * filter and their Base UI parts) loads after the page's own closure, then hydrates that HTML.
 */
const DocsSidebar = lazy(() => import("./docs-sidebar"));

/** Docs pages: the sidebar beside the page from 640px up; on smaller screens it opens as a drawer. */
export function DocsShell({ current, children }: { current: string; children: ReactNode }): JSX.Element {
  return (
    <PopupsProvider>
      <SiteHeader />
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
