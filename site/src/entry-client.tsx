import { StrictMode, startTransition } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App, loadPage } from "./app";
import { hydratingServerHtml } from "./hydrate";
import { pathFromLocation } from "./paths";
import { followSystemScheme } from "./themes/prepaint";

warmNumberFormatting();

// Follow the OS setting while the page is open, as the head script does before paint, unless the
// reader chose Surfaced or Submerged.
followSystemScheme();

const path = pathFromLocation(location.pathname, import.meta.env.BASE_URL);
const host = document.getElementById("root")!;
void afterFirstPaint()
  .then(() => loadPage(path))
  .then(nextTask)
  .then((Page) => {
    const app = (
      <StrictMode>
        <App path={path} Page={Page} />
      </StrictMode>
    );
    // Built pages are prerendered and hydrate; the dev server serves an empty shell.
    // As a transition, hydration yields to the browser every few milliseconds instead of running
    // as one long task, so a tap during it is answered at once.
    startTransition(() => {
      if (host.hasChildNodes()) {
        hydratingServerHtml();
        hydrateRoot(host, app);
      } else createRoot(host).render(app);
    });
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

/**
 * The first `Intl.NumberFormat` a page makes loads ICU's number data, about 30 ms of the main thread
 * at 4× CPU, and on the home page it fell inside the stage's hydration (the depth Slider). ICU keeps
 * that data for the whole renderer process, so a worker that formats a number first takes the load
 * off the main thread.
 */
function warmNumberFormatting(): void {
  if (typeof Worker === "undefined" || typeof Blob === "undefined") return;
  try {
    const url = URL.createObjectURL(new Blob(["new Intl.NumberFormat().format(1);postMessage(0);"], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = worker.onerror = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    // No worker here: the page formats its first number itself, as before.
  }
}

/** Resolves in a later task, so what follows doesn't add to the task that is running. */
function nextTask<T>(value?: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value as T), 0));
}
