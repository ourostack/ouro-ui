import type { JSX } from "react";
import { docsItems } from "./docs/items";
import { Landing } from "./pages/landing";
import { DocsComponent, DocsIndex, NotFound, Switching, Updating } from "./pages/docs";
import { routeFor } from "./routes";

/** The page for a site path (relative to the base). The server prerenders it; the client hydrates the same tree. */
export function App({ path }: { path: string }): JSX.Element {
  const route = routeFor(path)?.path;
  if (route === "/") return <Landing />;
  if (route === "/docs/") return <DocsIndex />;
  if (route === "/docs/switching-from-shadcn/") return <Switching />;
  if (route === "/docs/updating/") return <Updating />;
  const item = docsItems.find((doc) => route === `/docs/${doc.name}/`);
  return item ? <DocsComponent item={item} /> : <NotFound />;
}
