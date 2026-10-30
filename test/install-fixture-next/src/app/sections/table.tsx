import { Table } from "@/components/ouro/table/table";
import { TableBody, TableCell, TableRow } from "@/components/ouro/table/table-parts";

// expect: Ouro table
// expect: Braised short ribs
// A row link from a field name, which a Server Component can pass.
// expect: href="/recipes/short-ribs"
// expect: Ouro parts table
// expect: href="/pantry/flour"
// Sortable columns and a first sort, which a Server Component can pass.
// expect: Ouro sorted table
// expect: aria-sort="descending"
export default function TableSection() {
  return (
    <>
      <Table
        caption="Ouro table"
        columns={[
          { key: "name", header: "Recipe" },
          { key: "serves", header: "Serves", align: "end" },
        ]}
        rows={[{ id: "short-ribs", name: "Braised short ribs", serves: 6, href: "/recipes/short-ribs" }]}
        rowHref="href"
      />
      <Table
        caption="Ouro sorted table"
        columns={[
          { key: "name", header: "Recipe", sortable: true },
          { key: "serves", header: "Serves", align: "end", sortable: true },
        ]}
        rows={[
          { id: "salad", name: "Herb salad", serves: 2 },
          { id: "rye", name: "Seeded rye bread", serves: 8 },
        ]}
        defaultSort={{ key: "serves", direction: "descending" }}
      />
      <Table caption="Ouro parts table">
        <TableBody>
          <TableRow href="/pantry/flour">
            <TableCell rowHeader>Flour</TableCell>
            <TableCell align="end">2 kg</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </>
  );
}
