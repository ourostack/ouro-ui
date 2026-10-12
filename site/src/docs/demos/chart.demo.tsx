import { type JSX } from "react";
import { Chart } from "@/registry/ouro/components/ouro/chart/chart";

// The live demo at the top of docs/chart/: the component as an app would use it, with its props, nothing else.

const months = [
  { month: "January", cooked: 12, saved: 4 },
  { month: "February", cooked: 18, saved: 9 },
  { month: "March", cooked: 15, saved: 7 },
  { month: "April", cooked: 22, saved: 11 },
  { month: "May", cooked: 26, saved: 8 },
  { month: "June", cooked: 31, saved: 14 },
];

export default function ChartDemo(): JSX.Element {
  return (
    <Chart
      title="Recipes per month"
      description="January to June"
      data={months}
      categoryKey="month"
      config={{ month: { label: "Month" }, cooked: { label: "Cooked" }, saved: { label: "Saved" } }}
    />
  );
}
