"use client";

import { type CSSProperties, type HTMLAttributes, type JSX, type Key, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { TableBody, TableCell, TableHead, TableFrame, TableHeader, TableRow, type TableAlign } from "@/registry/ouro/components/ouro/table/table-parts";

/** The keys of `Row` whose values are assignable to `Value`. */
export type TableKeysOf<Row, Value> = { [K in keyof Row]-?: Row[K] extends Value ? K : never }[keyof Row] & string;

/** What every column takes, whichever way its cells are filled. */
export interface TableColumnBase {
  /**
   * The column's name, in its header cell. Keep it even for a column of buttons, and hide
   * it with `hideHeader`: screen readers read it with every cell.
   */
  header: string;
  /** Hides the header visually and keeps it for screen readers, for a column of actions. */
  hideHeader?: boolean | undefined;
  /**
   * How the column lines up: `end` for numbers and amounts, `center` for a status mark.
   * @default "start"
   */
  align?: TableAlign | (string & { 'Use "start", "center" or "end": right is "end"': never }) | undefined;
  /**
   * Makes this column the rows' headers (`<th scope="row">`), what each row is. With
   * `rowHref` its cell holds the row's link and names it. Without one, the first column with
   * no `cell` renderer is, or else the first column.
   */
  rowHeader?: boolean | undefined;
  /** Lets long text wrap onto more lines, at least 192px wide, instead of widening the table. */
  wrap?: boolean | undefined;
  /** Layout only, on the header cell: a width (`w-32`). */
  className?: string | undefined;

  /** Not a prop. Ouro UI uses `key`: `{ key: "name", header: "Recipe" }`. */
  accessorKey?: { 'Use key: "name"': never };
  /** Not a prop. Ouro UI uses `header`: `{ key: "name", header: "Recipe" }`. */
  title?: { 'Use header: "Recipe"': never };
  /** Not a prop. Ouro UI uses `header`: `{ key: "name", header: "Recipe" }`. */
  label?: { 'Use header: "Recipe"': never };
  /** Not a prop. Ouro UI uses `cell`: `{ key: "save", header: "Save", cell: (row) => <Button>Save</Button> }`. */
  render?: { "Use cell: (row) => ...": never };
}

/**
 * One column of a {@link Table}: its `header`, and where its cells come from. `key` names a
 * field of the row whose value is shown as it is (text, a number, an element), or, with
 * `cell`, any name, and `cell` renders each row's cell.
 */
export type TableColumn<Row> = TableColumnBase &
  (
    | {
        /** The field of each row to show, and the column's React key. */
        key: TableKeysOf<Row, ReactNode>;
        /** Renders the row's cell instead of the field's value. */
        cell?: ((row: Row, index: number) => ReactNode) | undefined;
      }
    | {
        /** The column's name for React; with `cell`, it need not be a field of the row. */
        key: string;
        /**
         * Renders the row's cell: a badge, a formatted date, a button. From a Server
         * Component, put the element in the row's field instead, because a function can't
         * cross to the client.
         */
        cell: (row: Row, index: number) => ReactNode;
      }
  );

/** The props every Table takes, with columns and rows or with parts. */
export interface TableOwnProps {
  /**
   * What the table shows: "Recipes", "Order history". It names the table and its scrolling
   * region for screen readers, and shows above it unless `hideCaption`.
   */
  caption: string;
  /** Hides the caption visually and keeps it as the table's name, when a heading already shows it. */
  hideCaption?: boolean | undefined;
  /** Shades every other body row, for long rows that are hard to follow across. */
  striped?: boolean | undefined;
  /** Tighter cells, for many rows. A row is still 44px tall on a touch screen when it is a link. */
  dense?: boolean | undefined;
  /**
   * Keeps the header row at the top while the rows scroll under it. The table scrolls inside
   * its own height, so give it one: `className="max-h-96"`. It keeps working while the table
   * also scrolls sideways.
   */
  stickyHeader?: boolean | undefined;
  /**
   * Layout: margins, width, and the height the table scrolls inside (`max-h-96`). Appearance
   * classes warn in development; put the Table inside a `Card` for a frame.
   */
  className?: string | undefined;
  style?: CSSProperties | undefined;
  /** A ref to the `<table>` element. */
  ref?: Ref<HTMLTableElement> | undefined;

  /** Not a prop. Ouro UI uses `rows`: `<Table rows={recipes} columns={…}>`. */
  data?: { "Use rows={recipes}": never };
  /** Not a prop. A row opens a link with `rowHref`: `<Table rowHref={(row) => `/recipes/${row.id}`}>`. */
  onRowClick?: { "Use rowHref={(row) => `/recipes/${row.id}`}": never };
  /** Not a prop. Ouro UI uses `caption`: `<Table caption="Recipes">`. */
  title?: { 'Use <Table caption="Recipes">': never };
  /** Not a prop. Table does not sort: pass the rows in the order to show them. */
  sortable?: { "Sort the rows yourself: rows={sortedRows}": never };
}

/** With columns and rows: the props that describe the whole table. */
export interface TableDataProps<Row> {
  /** The columns, in order: each one's `header`, `key` and optional `cell`. */
  columns: readonly TableColumn<NoInfer<Row>>[];
  /** The rows, in the order to show them. Table does not sort or page them. */
  rows: readonly Row[];
  /**
   * Each row's React key: the name of a field (`rowKey="slug"`) or a function. Without it,
   * a row's `id` field, or else its position.
   */
  rowKey?: TableKeysOf<Row, string | number> | ((row: Row, index: number) => Key) | undefined;
  /**
   * Makes each row one link, with one tab stop, named by its row header cell: a function
   * that returns the row's path (or `undefined` for a row that is not a link), or the name
   * of a field that holds it (`rowHref="href"`), which a Server Component can pass. Buttons,
   * links and inputs in the cells stay their own tab stops and take their own taps. On a
   * touch screen a linked row is at least 44px tall.
   */
  rowHref?: TableKeysOf<Row, string | undefined> | ((row: Row) => string | undefined) | undefined;
  /** Opens every row link in a new tab, safely, and tells screen readers so with `externalLabel`. */
  rowExternal?: boolean | undefined;
  /**
   * What screen readers hear after a row link's name with `rowExternal`.
   * @default "(opens in a new tab)"
   */
  externalLabel?: string | undefined;
  /**
   * What the body shows when there are no rows, in one cell across every column.
   * @default "Nothing here yet."
   */
  empty?: ReactNode;
  /** Only with parts. Pass columns and rows, or parts as children. */
  children?: never;
}

/** With parts: `TableHeader`, `TableBody` and `TableFooter` as children. */
export interface TablePartsProps {
  /** The parts: `TableHeader`, `TableBody` and `TableFooter`, with `TableRow`, `TableHead` and `TableCell` in them. */
  children: ReactNode;
  /** Only without parts. */
  columns?: never;
  /** Only without parts. */
  rows?: never;
  /** Only without parts. */
  rowKey?: never;
  /** Only without parts. Give a linked row `<TableRow href="…">`. */
  rowHref?: never;
  /** Only without parts. */
  empty?: never;
  /** Only without parts. Give a row `<TableRow href="…" external>`. */
  rowExternal?: never;
  /** Only without parts. Give a row `<TableRow externalLabel="…">`. */
  externalLabel?: never;
}

/**
 * Props for {@link Table}: columns and rows, or parts as children. The HTML attributes go to
 * the root `<div>`, and sit outside the union, which keeps the editor's hover docs.
 */
export type TableProps<Row extends object = Record<string, unknown>> = Omit<HTMLAttributes<HTMLDivElement>, keyof TableOwnProps | "children"> &
  TableOwnProps &
  (TableDataProps<Row> | TablePartsProps);

const aligns: readonly string[] = ["start", "center", "end"];

/** Whether the className or style gives the table a height to scroll inside. */
function hasHeight(className: string | undefined, style: CSSProperties | undefined): boolean {
  if (style?.height !== undefined || style?.maxHeight !== undefined) return true;
  return (className ?? "").split(/\s+/).some((token) => /^(max-)?h-/.test(token.slice(token.lastIndexOf(":") + 1)));
}

function columnWarnings(columns: readonly (TableColumnBase & { key: string })[]): DevWarning[] {
  const seen = new Set<string>();
  return columns.flatMap((column): DevWarning[] => {
    const { key } = column;
    const duplicate = seen.has(key);
    seen.add(key);
    return [
      !column.header && ["every column needs a header; it names the column for screen readers", '{ key: "…", header: "Actions", hideHeader: true }'],
      duplicate && [`two columns have key "${key}"; keys name columns, so each is unique`, '{ key: "name", … }, { key: "time", … }'],
      column.align !== undefined &&
        !aligns.includes(column.align) && [
          `align="${String(column.align)}" is not an alignment; use "start", "center", "end"`,
          `{ align: "${String(column.align) === "left" ? "start" : "end"}" }`,
        ],
      column.accessorKey !== undefined && ["a column's accessorKey is not a prop", `{ key: "${String(column.accessorKey)}", header: "…" }`],
      column.title !== undefined && ["a column's title is not a prop", `{ key: "…", header: "${String(column.title)}" }`],
      column.label !== undefined && ["a column's label is not a prop", `{ key: "…", header: "${String(column.label)}" }`],
      column.render !== undefined && ["a column's render is not a prop", '{ key: "…", header: "…", cell: (row) => … }'],
    ];
  });
}

/**
 * A data table: a caption, column headers, and rows, from `columns` and `rows` or from
 * parts. It scrolls sideways inside its own region on a phone, so the page never does.
 * With `rowHref` each row is one link with one tab stop, named by its row header, and the
 * buttons, links and inputs in its cells keep their own taps. `striped`, `dense` and
 * `stickyHeader` (inside a height you set) change how it reads; it does not sort or page.
 *
 * Use `DescriptionList` instead for one thing's details as label and value pairs, and
 * `ItemGroup` for a list of rows that need no columns, which reads better on a phone.
 *
 * @group Data
 * @see https://ourostack.github.io/ouro-ui/docs/table
 *
 * @example
 * <Table
 *   caption="Recipes"
 *   columns={[
 *     { key: "name", header: "Recipe" },
 *     { key: "time", header: "Time" },
 *     { key: "serves", header: "Serves", align: "end" },
 *   ]}
 *   rows={recipes}
 *   rowHref={(recipe) => `/recipes/${recipe.id}`}
 * />
 * <Table caption="Pantry" hideCaption>
 *   <TableHeader>
 *     <TableRow><TableHead>Item</TableHead><TableHead align="end">Qty</TableHead></TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow><TableCell rowHeader>Flour</TableCell><TableCell align="end">2 kg</TableCell></TableRow>
 *   </TableBody>
 * </Table>
 */
export function Table<Row extends object = Record<string, unknown>>(props: TableProps<Row>): JSX.Element {
  const {
    caption,
    hideCaption,
    striped,
    dense,
    stickyHeader,
    className,
    style,
    ref,
    columns,
    rows,
    rowKey,
    rowHref,
    rowExternal,
    externalLabel,
    empty = "Nothing here yet.",
    children,
    data,
    onRowClick,
    title,
    sortable,
    ...rest
  } = props as TableProps<Row> & Partial<TableDataProps<Row>> & { children?: ReactNode };
  useAppearanceClassNameCheck(
    "Table",
    className,
    process.env.NODE_ENV !== "production" ? "put the Table inside a <Card> for a frame" : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Table",
    process.env.NODE_ENV !== "production"
      ? () => [
          !caption && ["caption is required; it names the table", '<Table caption="Recipes">, with hideCaption when a heading already shows it'],
          data !== undefined && ["data is not a prop", "<Table rows={recipes} columns={…}>"],
          onRowClick !== undefined && ["onRowClick is not a prop; a row opens a link", "<Table rowHref={(row) => `/recipes/${row.id}`}>"],
          title !== undefined && ["title is not a prop", `<Table caption="${String(title)}">`],
          sortable !== undefined && ["sortable is not a prop; Table does not sort", "<Table rows={sortedRows}>"],
          children !== undefined &&
            columns !== undefined && ["pass columns and rows, or parts as children, not both", '<Table caption="…" columns={…} rows={…} />'],
          columns !== undefined && rows === undefined && ["columns need rows", "<Table columns={…} rows={recipes}>"],
          stickyHeader && !hasHeight(className, style) && ["stickyHeader needs a height to scroll inside", '<Table stickyHeader className="max-h-96">'],
          ...columnWarnings(columns ?? []),
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const list = rows ?? [];
  // The row header holds the row link and names it: the column marked rowHeader, or else the
  // first that shows a field's value (a `cell` renderer is often a checkbox or a badge).
  const marked = columns?.findIndex((column) => column.rowHeader) ?? -1;
  const headerIndex = marked >= 0 ? marked : Math.max(0, columns?.findIndex((column) => !column.cell) ?? 0);
  const alignOf = (align: string | undefined) => (align !== undefined && aligns.includes(align) ? (align as TableAlign) : undefined);
  const body =
    columns === undefined ? (
      children
    ) : (
      <>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} align={alignOf(column.align)} hideHeader={column.hideHeader} wrap={column.wrap} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <span className="text-muted-foreground">{empty}</span>
              </TableCell>
            </TableRow>
          ) : (
            list.map((row, index) => {
              const fields = row as Record<string, unknown>;
              const key =
                typeof rowKey === "function"
                  ? rowKey(row, index)
                  : rowKey !== undefined
                    ? (fields[rowKey] as Key)
                    : typeof fields["id"] === "string" || typeof fields["id"] === "number"
                      ? fields["id"]
                      : index;
              const href = typeof rowHref === "function" ? rowHref(row) : rowHref !== undefined ? (fields[rowHref] as string | undefined) : undefined;
              return (
                <TableRow key={key} href={href} external={rowExternal} externalLabel={externalLabel}>
                  {columns.map((column, columnIndex) => (
                    <TableCell key={column.key} rowHeader={columnIndex === headerIndex} align={alignOf(column.align)} wrap={column.wrap}>
                      {column.cell ? column.cell(row, index) : (fields[column.key] as ReactNode)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </>
    );
  return (
    <TableFrame
      {...rest}
      caption={caption}
      hideCaption={hideCaption}
      striped={striped}
      dense={dense}
      stickyHeader={stickyHeader}
      className={className}
      style={style}
      tableRef={ref}
    >
      {body}
    </TableFrame>
  );
}
