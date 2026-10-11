import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./app";
import { pathFromLocation } from "./routes";
import "./styles.css";

// Follow the OS setting while the page is open, as the head script does before paint.
const dark = matchMedia("(prefers-color-scheme: dark)");
dark.addEventListener("change", (event) => document.documentElement.classList.toggle("dark", event.matches));

const host = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App path={pathFromLocation(location.pathname, import.meta.env.BASE_URL)} />
  </StrictMode>
);
// Built pages are prerendered and hydrate; the dev server serves an empty shell.
if (host.hasChildNodes()) hydrateRoot(host, app);
else createRoot(host).render(app);
