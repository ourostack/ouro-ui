import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./app";

export { headTags } from "./head";
export { routes, routeFor } from "./routes";
export { docsItems, installedPaths } from "./docs/items";
export { docsPages, publishedMarkdown } from "./docs/pages";

/** The HTML for one route, for site/scripts/prerender.mts. */
export function render(path: string): string {
  return renderToString(
    <StrictMode>
      <App path={path} />
    </StrictMode>,
  );
}
