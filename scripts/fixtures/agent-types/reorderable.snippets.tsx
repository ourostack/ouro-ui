// What agents write with reorderable: snippets whose cases are in reorderable.cases.ts.
import { Reorderable } from "@/registry/ouro/components/ouro/reorderable/reorderable";

const steps = [{ id: "1", label: "Sear the ribs" }, { id: "2", label: "Braise" }];
const save = () => {};

export const reorderable01 = <Reorderable label="Steps" items={steps} values={["1", "2"]} />;
export const reorderable02 = <Reorderable label="Steps" items={steps} onChange={save} />;
export const reorderable03 = <Reorderable label="Steps" items={steps} onDragEnd={save} />;
export const reorderable04 = <Reorderable label="Steps" items={steps} axis="y" />;
export const reorderable05 = <Reorderable items={steps} />;
export const reorderable06 = <Reorderable label="Steps" items={steps} renderItem={() => null} />;
export const reorderableOk01 = <Reorderable label="Steps" items={steps} onReorder={save} handleLabel="Reorder {label}" instructionsLabel="Press Space to pick up." pickedUpLabel="{label} picked up." movedLabel="{label} moved." droppedLabel="{label} dropped." canceledLabel="{label} put back." className="mt-2" />;
export const reorderableOk02 = <Reorderable label="Steps" items={steps} onReorder={save} disabled />;
