import { Chart } from "@/components/ouro/chart/chart";

// The title, the summary and the data table are in the server HTML; recharts draws the plot on the client.
// expect: <figcaption[^>]*>Ouro chart</figcaption>
// expect: Bar chart of Cooked by Month, 2 points
// expect: <th scope="row"[^>]*>February</th><td[^>]*>1,250</td>
export default function ChartSection() {
  return (
    <Chart
      title="Ouro chart"
      data={[
        { month: "January", cooked: 12 },
        { month: "February", cooked: 1250 },
      ]}
      categoryKey="month"
      config={{ month: { label: "Month" }, cooked: { label: "Cooked" } }}
    />
  );
}
