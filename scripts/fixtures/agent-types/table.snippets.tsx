// What agents write with table: snippets whose cases are in table.cases.ts.
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/registry/ouro/components/ouro/table/table-parts";

const recipes = [{ id: "ribs", name: "Ribs", serves: 6 }];

export const table01 = <Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} data={recipes} />;
export const table02 = <Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} onRowClick={() => {}} />;
export const table03 = <Table title="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />;
export const table04 = <Table caption="Recipes" columns={[{ key: "name", header: "Recipe", accessorKey: "name" }]} rows={recipes} />;
export const table05 = <Table caption="Recipes" columns={[{ key: "serves", header: "Serves", align: "right" }]} rows={recipes} />;
export const table06 = <Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} sortable />;
export const table07 = <Table caption="Recipes" columns={[{ key: "name", header: "Recipe", sortable: true }]} rows={recipes} defaultSort={{ key: "name", direction: "desc" }} />;
export const table08 = <Table caption="Recipes" columns={[{ key: "name", header: "Recipe", enableSorting: true }]} rows={recipes} />;
export const table09 = <Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }, { key: "serves", header: "Serves", align: "end" }]} rows={recipes} rowHref={(row) => `/recipes/${row.id}`} striped dense />;
export const table10 = <Table caption="Pantry" hideCaption stickyHeader className="max-h-96"><TableBody><TableRow href="/pantry/flour"><TableCell rowHeader>Flour</TableCell><TableCell align="end">2 kg</TableCell></TableRow></TableBody></Table>;
export const table11 = <Table caption="Recipes" columns={[{ key: "name", header: "Recipe", sortable: true }, { key: "time", header: "Time", cell: (row) => `${row.serves} people`, sortValue: (row) => row.serves }]} rows={recipes} defaultSort={{ key: "name", direction: "descending" }} onSortChange={() => {}} />;
export const table12 = <Table caption="Pantry"><TableHeader><TableRow><TableHead sorted="ascending" onSort={() => {}}>Item</TableHead></TableRow></TableHeader></Table>;
