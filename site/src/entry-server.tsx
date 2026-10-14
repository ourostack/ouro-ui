import { StrictMode } from "react";
import { App } from "./app";
import { renderHtml } from "./render-html";

export { headTags } from "./head";
export { routes, routeFor } from "./routes";
export { docsItems, installedPaths } from "./docs/items";
export { docsPages, publishedMarkdown } from "./docs/pages";

/** The HTML for one route, for site/scripts/prerender.mts. */
export function render(path: string): Promise<string> {
  return renderHtml(
    <StrictMode>
      <App path={path} />
    </StrictMode>,
  );
}
