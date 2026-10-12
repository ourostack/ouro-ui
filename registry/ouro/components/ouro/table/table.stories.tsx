import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Table, type TableColumn } from "@/registry/ouro/components/ouro/table/table";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/registry/ouro/components/ouro/table/table-parts";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

function Page({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 24, display: "grid", gap: 24 }}>{children}</div>;
}

interface Recipe {
  id: string;
  name: string;
  cook: string;
  time: string;
  serves: number;
  status: "Published" | "Draft";
}

const recipes: Recipe[] = [
  { id: "short-ribs", name: "Braised short ribs", cook: "Ari", time: "4 h", serves: 6, status: "Published" },
  { id: "herb-salad", name: "Herb salad", cook: "Sam", time: "10 min", serves: 2, status: "Published" },
  { id: "rye", name: "Seeded rye bread", cook: "Ari", time: "18 h", serves: 8, status: "Draft" },
  { id: "dal", name: "Tadka dal", cook: "Priya", time: "45 min", serves: 4, status: "Published" },
];

const columns: TableColumn<Recipe>[] = [
  { key: "name", header: "Recipe" },
  { key: "cook", header: "Cook" },
  { key: "time", header: "Time" },
  { key: "serves", header: "Serves", align: "end" },
  { key: "status", header: "Status", cell: (row) => <Badge tone={row.status === "Draft" ? "warning" : "success"} variant="soft">{row.status}</Badge> },
  {
    key: "save",
    header: "Actions",
    hideHeader: true,
    align: "end",
    cell: (row) => (
      <Button variant="outline" size="sm" aria-label={`Save ${row.name}`}>
        Save
      </Button>
    ),
  },
];

/** Table for recipe rows, so the controls know the row type. */
const RecipeTable = Table<Recipe>;

const meta = {
  title: "Data/Table",
  component: RecipeTable,
  parameters: { layout: "padded" },
  args: { caption: "Recipes", columns, rows: recipes },
} satisfies Meta<typeof RecipeTable>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** A recipe list where each row opens the recipe, with a status badge and a Save button that keep their own taps. On a phone it scrolls sideways. */
export const InContext: Story = {
  parameters: { screenshot: { name: "table" } },
  render: () => (
    <Page>
      <Table caption="Recipes" striped columns={columns} rows={recipes} rowHref={(row) => `#${row.id}`} />
    </Page>
  ),
};

const log = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  step: `Step ${index + 1}`,
  station: ["Grill", "Prep", "Pastry"][index % 3]!,
  start: `${String(9 + Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
  minutes: 5 + ((index * 7) % 30),
  note: index % 2 ? "Rest before slicing" : "Season again at the end",
}));

/** A long log inside a height: the header stays at the top while the rows scroll, and while the table scrolls sideways. */
export const StickyHeader: Story = {
  render: () => (
    <Page>
      <Table
        caption="Prep log"
        stickyHeader
        dense
        className="max-h-80"
        columns={[
          { key: "step", header: "Step" },
          { key: "station", header: "Station" },
          { key: "start", header: "Start" },
          { key: "minutes", header: "Minutes", align: "end" },
          { key: "note", header: "Note" },
        ]}
        rows={log}
      />
    </Page>
  ),
};

/** Built from parts, with a linked row, a hidden header over the actions and a total in the footer. */
export const Parts: Story = {
  render: () => (
    <Page>
      <Table caption="Pantry" hideCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead align="end">Qty</TableHead>
            <TableHead hideHeader>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow href="#flour">
            <TableCell rowHeader>Flour</TableCell>
            <TableCell align="end">2 kg</TableCell>
            <TableCell align="end">
              <Button variant="plain" size="sm" aria-label="Use flour">
                Use
              </Button>
            </TableCell>
          </TableRow>
          <TableRow href="#rice">
            <TableCell rowHeader>Rice</TableCell>
            <TableCell align="end">1 kg</TableCell>
            <TableCell align="end">
              <Button variant="plain" size="sm" aria-label="Use rice">
                Use
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell rowHeader>Total</TableCell>
            <TableCell align="end">3 kg</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </Page>
  ),
};

/** No rows yet: the empty message across every column. */
export const Empty: Story = {
  render: () => (
    <Page>
      <Table caption="Recipes" columns={columns} rows={[] as Recipe[]} empty="No recipes yet. Add your first one." />
    </Page>
  ),
};
