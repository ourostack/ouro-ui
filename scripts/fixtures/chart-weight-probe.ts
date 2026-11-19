// Bundled by scripts/chart-weight.test.mjs to weigh what a chart drawn with `type` adds to an app's production build.
// Imports the registry source, as an app that installed Chart would.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Chart } from "@/registry/ouro/components/ouro/chart/chart";

const months = [
  { month: "January", cooked: 12 },
  { month: "February", cooked: 18 },
];

createRoot(document.body).render(createElement(Chart, { title: "Cooking", data: months, categoryKey: "month", config: { cooked: { label: "Cooked" } } }));
