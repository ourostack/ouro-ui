// Bundled by scripts/chart-weight.test.mjs as its control: an app that passes its own recharts chart with ChartTooltip
// and ChartLegend inside it, which load recharts' Tooltip and Legend by a dynamic import.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Chart, ChartLegend, ChartTooltip } from "@/registry/ouro/components/ouro/chart/chart";

const months = [
  { month: "January", cooked: 12 },
  { month: "February", cooked: 18 },
];

createRoot(document.body).render(
  createElement(Chart, { title: "Cooking", data: months, categoryKey: "month", config: { cooked: { label: "Cooked" } } }, createElement("div", null, createElement(ChartTooltip), createElement(ChartLegend))),
);
