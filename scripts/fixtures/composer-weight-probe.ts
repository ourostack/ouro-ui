// Bundled by scripts/composer-weight.test.mjs to weigh what a plain Composer adds to an app's production build.
// Imports the registry source, as an app that installed Composer would.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";

createRoot(document.body).render(createElement(Composer, { label: "Message", onSend: () => {} }));
