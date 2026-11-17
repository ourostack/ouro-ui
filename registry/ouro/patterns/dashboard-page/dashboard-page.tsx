import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { Chart } from "@/registry/ouro/components/ouro/chart/chart";
import { ColorSchemeToggle } from "@/registry/ouro/components/ouro/color-scheme-toggle/color-scheme-toggle";
import { PageHeader } from "@/registry/ouro/components/ouro/page-header/page-header";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

/** A number the dashboard leads with, and how it moved. */
export interface Stat {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "flat";
}

/** A month of the chart: one value per series. */
export interface Month {
  month: string;
  orders: number;
  returns: number;
}

/** A row of the recent activity table. */
export interface Activity {
  id: string;
  customer: string;
  placed: string;
  total: string;
  status: "Paid" | "Refunded" | "Pending";
}

// Made-up data to show the page; replace it with your own.
const sampleStats: Stat[] = [
  { label: "Revenue", value: "$48,200", change: "+12% from last month", trend: "up" },
  { label: "Orders", value: "1,284", change: "+4% from last month", trend: "up" },
  { label: "Returns", value: "38", change: "-6% from last month", trend: "down" },
];
const sampleMonths: Month[] = [
  { month: "Jan", orders: 860, returns: 40 },
  { month: "Feb", orders: 920, returns: 36 },
  { month: "Mar", orders: 1010, returns: 44 },
  { month: "Apr", orders: 1180, returns: 41 },
  { month: "May", orders: 1230, returns: 39 },
  { month: "Jun", orders: 1284, returns: 38 },
];
const sampleActivity: Activity[] = [
  { id: "1042", customer: "Mara Lind", placed: "Jun 28", total: "$120.00", status: "Paid" },
  { id: "1041", customer: "Tomás Ruiz", placed: "Jun 28", total: "$64.50", status: "Pending" },
  { id: "1040", customer: "Ada Osei", placed: "Jun 27", total: "$210.00", status: "Refunded" },
];

const trendTone = { up: "success", down: "warning", flat: "secondary" } as const;
const statusTone = { Paid: "success", Pending: "secondary", Refunded: "warning" } as const;

/**
 * A whole dashboard page: a header with the light and dark toggle, the numbers that matter in cards, a chart of the
 * last months and a table of recent activity. It draws itself from Ouro's theme, with layout classes only. Render it
 * with your data, then change the cards and columns to what your app tracks.
 *
 * What it already does, which Ouro's own tests cover: each card is headed by its number, read with its label; with
 * no activity it says "No activity yet." in place of the table; it renders from a Server Component, since it passes
 * no function to the client components inside it.
 *
 * What the app wires up: the toggle needs `ColorSchemeProvider` around the app, and the script that sets light or
 * dark before the first paint, as the agent quickstart sets up: https://ui.ouroboros.bot/docs/agent-quickstart.md.
 *
 * To change it, edit this file: the `Stat`, `Month` and `Activity` types and the sample data. The parts it uses take:
 * - `Chart`: `title` (with `hideTitle`), `data`, `categoryKey`, and `config`, a label and an optional `tone` per
 *   series; it draws bars unless `type` says otherwise.
 * - `Table`: `caption` (with `hideCaption`), `columns` (`{ key, header, align }`) and `rows`; put an element such as a
 *   `Badge` in a row's field rather than a `cell` function, which a Server Component can't pass.
 * - `Badge`: `tone` and `variant="soft"`. `Heading`: `level` and `size`. `Text`: `size` and `tone`.
 * - `Card`: `title`, `headingLevel`. `PageHeader`: `title`, `description`, `actions`. `Stack`: `gap`.
 * A component's whole API is on its page, https://ui.ouroboros.bot/docs/<item>.md.
 *
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::DashboardPage > is a whole page: a heading, a card per number, headed by the number with its label, with how it moved, a chart and the recent activity, and passes axe)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::DashboardPage > draws the numbers, months and rows it is given, and says when there is no activity)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::DashboardPage > is a Server Component that hands no function to the client components it renders)
 *
 * @example
 * import { DashboardPage } from "@/components/patterns/dashboard-page";
 * <DashboardPage stats={stats} months={months} activity={orders} />
 */
export function DashboardPage({
  stats = sampleStats,
  months = sampleMonths,
  activity = sampleActivity,
}: {
  /** The numbers at the top, in cards. */
  stats?: readonly Stat[];
  /** The chart's months. */
  months?: readonly Month[];
  /** Recent rows of activity. */
  activity?: readonly Activity[];
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <Stack gap="lg">
        <PageHeader title="Overview" description="How the store is doing this month." actions={<ColorSchemeToggle />} />
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <Stack gap="xs">
                <Text size="sm" tone="muted" aria-hidden="true">
                  {stat.label}
                </Text>
                {/* The number is the card's heading, read with its label: "Revenue: $48,200". */}
                <Heading level={2} size="2xl">
                  <span className="sr-only">{stat.label}: </span>
                  {stat.value}
                </Heading>
                <div>
                  <Badge tone={trendTone[stat.trend]} variant="soft">
                    {stat.change}
                  </Badge>
                </div>
              </Stack>
            </Card>
          ))}
        </div>
        <Card title="Orders by month" headingLevel={2}>
          <Chart
            title="Orders and returns by month"
            hideTitle
            data={months}
            categoryKey="month"
            config={{ orders: { label: "Orders" }, returns: { label: "Returns", tone: "chart-2" } }}
            className="h-64"
          />
        </Card>
        <Stack gap="sm">
          <Heading level={2} size="lg">
            Recent activity
          </Heading>
          {activity.length > 0 ? (
            <Table
              caption="Recent activity"
              hideCaption
              columns={[
                { key: "id", header: "Order" },
                { key: "customer", header: "Customer" },
                { key: "placed", header: "Placed" },
                { key: "total", header: "Total", align: "end" },
                { key: "status", header: "Status" },
              ]}
              // Each badge is in its row's field, not a cell function, which a Server Component can't pass on.
              rows={activity.map((row) => ({
                ...row,
                status: (
                  <Badge tone={statusTone[row.status]} variant="soft">
                    {row.status}
                  </Badge>
                ),
              }))}
            />
          ) : (
            <Text tone="muted">No activity yet.</Text>
          )}
        </Stack>
      </Stack>
    </main>
  );
}
