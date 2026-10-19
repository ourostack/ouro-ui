import { StrictMode } from "react";
import { App, loadPage } from "./app";
import { renderHtml } from "./render-html";

export { headTags } from "./head";
export { routes, routeFor } from "./routes";
export { pageKind } from "./paths";
export { docsItems, installedPaths } from "./docs/items";
export { docsPages, publishedMarkdown } from "./docs/pages";

/** The HTML for one route, for site/scripts/prerender.mts. */
export async function render(path: string): Promise<string> {
  const Page = await loadPage(path);
  return renderHtml(
    <StrictMode>
      <App path={path} Page={Page} />
    </StrictMode>,
  );
}
