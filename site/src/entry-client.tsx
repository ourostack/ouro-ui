import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App, loadPage } from "./app";
import { pathFromLocation } from "./paths";
import { followSystemScheme } from "./themes/prepaint";
import "./styles.css";

// Follow the OS setting while the page is open, as the head script does before paint, unless the
// reader chose Surfaced or Submerged.
followSystemScheme();

const path = pathFromLocation(location.pathname, import.meta.env.BASE_URL);
const host = document.getElementById("root")!;
void loadPage(path).then((Page) => {
  const app = (
    <StrictMode>
      <App path={path} Page={Page} />
    </StrictMode>
  );
  // Built pages are prerendered and hydrate; the dev server serves an empty shell.
  if (host.hasChildNodes()) hydrateRoot(host, app);
  else createRoot(host).render(app);
});
