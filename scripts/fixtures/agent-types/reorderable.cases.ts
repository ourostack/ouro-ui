import { type AgentCase, notAssignable } from "./shared.ts";

const itemsFix = 'items={[{ id: "1", label: "Sear the ribs", content: <Item title="Sear the ribs" /> }]}';
const reorder = notAssignable("() => void", '{ "Use onReorder={(ids) => save(ids)}": never; }');

/** The reorderable snippets in reorderable.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "reorderable01",
    habit: "Motion's Reorder.Group values",
    tsc: [`error TS2741: Property '"Use items={[{ id, label, content }]}"' is missing in type 'string[]' but required in type '{ "Use items={[{ id, label, content }]}": never; }'.`],
    dev: itemsFix,
    names: ["tsc", "dev"],
  },
  { id: "reorderable02", habit: "an onChange callback", tsc: [reorder], dev: "onReorder={(ids) => save(ids)}", names: ["tsc", "dev"] },
  { id: "reorderable03", habit: "dnd-kit's onDragEnd", tsc: [reorder], dev: "onReorder={(ids) => save(ids)}", names: ["tsc", "dev"] },
  {
    id: "reorderable04",
    habit: "Motion's axis",
    tsc: [notAssignable("string", '{ "Reorderable is a vertical list; remove axis": never; }')],
    dev: '<Reorderable label="Steps" items={…}>',
    names: ["tsc", "dev"],
  },
  {
    id: "reorderable05",
    habit: "a list with no label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ items: { id: string; label: string; }[]; }' but required in type 'ReorderableProps'.`],
    dev: '<Reorderable label="Steps">',
    names: ["tsc", "dev"],
  },
  {
    id: "reorderable06",
    habit: "a renderItem function",
    tsc: [notAssignable("() => null", '{ "Use items={[{ id, label, content: <Item ... /> }]}": never; }')],
    dev: itemsFix,
    names: ["tsc", "dev"],
  },
];

/** Valid reorderable snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["reorderableOk01", "reorderableOk02"];
