import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./app";

export { routes, routeFor } from "./routes";
export { docsItems } from "./docs/items";

/** The HTML for one route, for site/scripts/prerender.mts. */
export function render(path: string): string {
  return renderToString(
    <StrictMode>
      <App path={path} />
    </StrictMode>,
  );
}
