// Bundled by scripts/dev-strip.test.mjs to prove the built package's dev messages
// are stripped from a consumer's production build. Imports dist, as an app would.
import { createElement } from "react";
import { Button, Heading, Text } from "../../dist/index.js";

export const elements = [
  createElement(Button, { className: "bg-red-500", isLoading: true }, "Go"),
  createElement(Button, { href: "/x", type: "submit" }, "Link"),
  createElement(Text, { className: "text-center" }, "Body"),
  createElement(Heading, { level: 2, className: "text-4xl" }, "Title"),
];
