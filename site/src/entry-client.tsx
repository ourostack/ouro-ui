import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App, loadPage } from "./app";
import { pathFromLocation } from "./paths";
import { followSystemScheme } from "./themes/prepaint";

// Follow the OS setting while the page is open, as the head script does before paint, unless the
// reader chose Surfaced or Submerged.
followSystemScheme();

const path = pathFromLocation(location.pathname, import.meta.env.BASE_URL);
const host = document.getElementById("root")!;
void afterFirstPaint()
  .then(() => loadPage(path))
  .then((Page) => {
    const app = (
      <StrictMode>
        <App path={path} Page={Page} />
      </StrictMode>
    );
    // Built pages are prerendered and hydrate; the dev server serves an empty shell.
    if (host.hasChildNodes()) hydrateRoot(host, app);
    else createRoot(host).render(app);
  });

/**
 * Resolves once the server HTML has painted (or after a second, for a tab that never paints). The
 * page reads fine before it hydrates, so its own JavaScript waits rather than competing with the
 * stylesheets and fonts the first paint needs.
 */
function afterFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => setTimeout(resolve, 0);
    setTimeout(resolve, 1000);
    if (!host.hasChildNodes() || !PerformanceObserver.supportedEntryTypes?.includes("paint")) {
      requestAnimationFrame(() => requestAnimationFrame(done));
      return;
    }
    const observer = new PerformanceObserver((list) => {
      if (list.getEntriesByName("first-contentful-paint").length === 0) return;
      observer.disconnect();
      done();
    });
    observer.observe({ type: "paint", buffered: true });
  });
}
