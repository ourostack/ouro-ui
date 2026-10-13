// What agents write with chart: snippets whose cases are in chart.cases.ts.
import { Bar, BarChart } from "recharts";
import { Chart, ChartTooltip } from "@/registry/ouro/components/ouro/chart/chart";

const months = [{ month: "January", cooked: 12, saved: 4 }];

export const chart01 = <Chart data={months} categoryKey="month" config={{ cooked: { label: "Cooked" } }} />;
export const chart02 = <Chart title="Cooking" data={months} categoryKey="month" config={{ cooked: { label: "Cooked", color: "#2563eb" } }} />;
export const chart03 = <Chart title="Cooking" data={months} categoryKey="month" config={{ cooked: { label: "Cooked", tone: "blue" } }} />;
export const chart04 = <Chart title="Cooking" data={months} categoryKey="month" config={{ cooked: { label: "Cooked" } }} type="pie" />;
export const chart05 = <Chart title="Cooking" data={months} categoryKey="month" config={{ cooked: { label: "Cooked" } }}><BarChart><Bar dataKey="cooked" /><ChartTooltip content={<div />} /></BarChart></Chart>;
export const chartOk01 = <Chart title="Cooking" hideTitle description="This year" data={months} categoryKey="month" config={{ month: { label: "Month" }, cooked: { label: "Cooked", tone: "chart-2" } }} type="line" showTable />;
export const chartOk02 = <Chart title="Cooking" data={months} categoryKey="month" config={{ cooked: { label: "Cooked" } }}><BarChart><Bar dataKey="cooked" fill="var(--color-cooked)" /><ChartTooltip /></BarChart></Chart>;
